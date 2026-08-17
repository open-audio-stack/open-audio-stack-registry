// Usage: tsx ./src/fetch.ts <github-url> [version-tag]
// Collects all deterministic metadata from a GitHub repo and writes a registry index.yaml.
// Review the printed output for: type, tags, changes, and any "contains" fields flagged as unknown.

import { createHash } from 'crypto';
import { execFileSync, execSync } from 'child_process';
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import * as semver from 'semver';
import { getGithubToken } from './githubAuth.js';

const YAML_KEY_ORDER = [
  'name',
  'author',
  'description',
  'license',
  'type',
  'tags',
  'url',
  'donate',
  'audio',
  'image',
  'date',
  'changes',
  'files',
];
const FILE_KEY_ORDER = ['systems', 'architectures', 'contains', 'format', 'type', 'size', 'sha256', 'attested', 'url'];

// ── gh CLI helper ─────────────────────────────────────────────────────────────

function ghJson(args: string): any {
  return JSON.parse(execSync(`gh ${args}`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }));
}

function ghUserDisplayName(login: string): string {
  try {
    const user = ghJson(`api users/${login}`);
    return user.name || login;
  } catch {
    return login;
  }
}

// GitHub Artifact Attestations link a release asset back to the CI run/commit/repo that built
// it (Sigstore-backed, verifiable independently via `gh attestation verify` or this same REST
// endpoint - the digest + repo we already store is all a consumer needs, no extra field
// required). A direct REST call rather than shelling out to the gh CLI: this eventually runs as
// part of the registry build inside GitHub Actions, which can't assume any CLI beyond what's
// preinstalled, whereas GITHUB_TOKEN (all this needs) is always present there automatically.
// Most developers won't have attestations configured yet, so a 404 (or any other failure) just
// means "unattested", not an error worth surfacing to the reviewer. Checked once here, at import
// time, rather than on every registry build: a published file's sha256/url/release never change
// afterwards, so neither does its attestation status.
async function checkAttestation(org: string, repo: string, sha256: string): Promise<boolean> {
  try {
    const res = await fetch(`https://api.github.com/repos/${org}/${repo}/attestations/sha256:${sha256}`, {
      headers: {
        Authorization: `Bearer ${getGithubToken()}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });
    if (!res.ok) return false;
    const data: any = await res.json();
    return Array.isArray(data.attestations) && data.attestations.length > 0;
  } catch {
    return false;
  }
}

// ── String helpers ────────────────────────────────────────────────────────────

// GitHub topics are a mix of genuinely descriptive categories (guitar-amp, compressor,
// tape-emulation) and purely technical ones — plugin formats, frameworks, and toolchains
// (vst3-plugin, clap, lv2, dpf, juce, faust-dsp) that are already captured by this package's
// own `contains`/`type` fields and add no information as a registry tag. AGENTS.md already
// documents this distinction for the human reviewer ("GitHub topics are technical... registry
// tags should be semantic categories"), but blindly taking the first 8 topics let noise like
// "Clap Plugin"/"Faust Dsp" crowd out real ones like "guitar-pedal"/"rockman" (PR #819).
// Filtering known-technical topics out before slicing to 8 means more of those slots land on
// something semantically useful, without changing the reviewer's job of double-checking tags.
const TECHNICAL_TOPIC_RE =
  /^(vst|vst2|vst3(-plugins?)?|vst-plugins?|clap(-plugins?)?|lv2(-plugins?)?|au|au-plugins?|audiounit|aax(-plugins?)?|ladspa(-plugins?)?|dssi|dpf|juce(-.*)?|jsfx|faust(-dsp)?|standalone|audio-plugins?|audio-unit|plugin|plugins|cli|sdk|api|library|framework|cross-platform|linux|windows|macos|osx|cmake|c|cpp|c-plus-plus|rust|python|typescript|javascript|nodejs|wasm|webassembly)$/;

function slugToTitleCase(slug: string): string {
  return slug
    .replace(/([a-z])([A-Z])/g, '$1 $2') // camelCase → camel Case
    .split(/[-_\s]+/)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

// ── License detection ──────────────────────────────────────────────────────────

// GitHub's license detector is a similarity classifier, not a human — it regularly comes back
// `other`/null for a repo that ships a perfectly standard license under an unusual filename, with
// extra project-specific header lines, or phrased as a short "under the terms of the GNU GPL v3"
// notice rather than the full canonical block. When that happens, fetch the LICENSE file's own
// text and pattern-match it directly. Order matters: AGPL/LGPL are checked before plain GPL since
// their canonical text contains "General Public License" as a substring too.
function detectLicenseFromText(text: string): string | null {
  // Collapse whitespace (including hard line-wraps at ~80 columns, extremely common in
  // LICENSE files) before matching — a fingerprint phrase spanning a wrap point otherwise
  // silently fails to match even though the license text is a byte-for-byte standard copy.
  const t = text.slice(0, 4000).replace(/\s+/g, ' ');
  const has = (re: RegExp) => re.test(t);

  // Some LICENSE files aren't a single canonical text — they attribute the project's own
  // license up top, then quote the license text of each bundled third-party dependency
  // below (DPF, JUCE, etc.), each with its own boilerplate body. Full-text pattern matching
  // below can latch onto a *bundled dependency's* canonical paragraph before ever reaching
  // the project's own (seen on SpotlightKid/waxman: its LICENSE.md says "Waxman is released
  // under the MIT license" but happens to phrase that grant using ISC's canonical wording,
  // while a genuinely ISC-licensed dependency is quoted further down — full-text matching
  // picked ISC for the whole package, which PR #819's author corrected). An explicit
  // "released/licensed under the X license" declaration is a stronger, more direct signal
  // of the *project's* license than boilerplate text-sniffing, so check for the first such
  // declaration before falling back to full-text matching.
  const declared = t.match(
    /(?:is |^)(?:released|licen[sc]ed) under the ([A-Za-z0-9][A-Za-z0-9.+\- ]{1,40}?) licen[sc]e/i,
  );
  if (declared) {
    const name = declared[1].trim().toLowerCase();
    const declaredMap: Array<[RegExp, string]> = [
      [/^mit$/, 'mit'],
      [/^isc$/, 'isc'],
      [/^(bsd-?3(-clause)?|bsd 3-clause)$/, 'bsd-3-clause'],
      [/^(bsd-?2(-clause)?|bsd 2-clause)$/, 'bsd-2-clause'],
      [/^apache(?:-| )?2\.0$/, 'apache-2.0'],
      [/^mpl(?:-| )?2\.0$/, 'mpl-2.0'],
      [/^(gpl-?3(\.0)?\+?|gplv3\+?)$/, 'gpl-3.0'],
      [/^(gpl-?2(\.0)?\+?|gplv2\+?)$/, 'gpl-2.0'],
      [/^(lgpl-?2\.1\+?|lgplv2\.1\+?)$/, 'lgpl-2.1'],
      [/^(lgpl-?3(\.0)?\+?|lgplv3\+?)$/, 'lgpl-3.0'],
      // "AGPL" bare, or spelled out in full with no version number, still resolves to agpl-3.0:
      // unlike GPL/LGPL (where v2 still sees meaningful real-world use, so an unversioned
      // mention is genuinely ambiguous), AGPL v1 was never released — every AGPL license in
      // circulation is v3, so there's no other version an unqualified mention could mean.
      // Seen on Davit-G/Hamburger: "licensed under the GNU Affero General Public License
      // (GNU AGPL)" with no version number anywhere near it.
      [/^(agpl-?3(\.0)?\+?|agplv3\+?|agpl|gnu affero general public(?: license)?)$/, 'agpl-3.0'],
      [/^zlib$/, 'zlib'],
      [/^(0bsd|bsd zero-?clause)$/, '0bsd'],
      [/^cc0(?:-1\.0)?$/, 'cc0-1.0'],
      [/^unlicense$/, 'unlicense'],
      [/^wtfpl$/, 'wtfpl'],
      [/^(bsl(?:-| )?1\.0|boost software license.*)$/, 'bsl-1.0'],
    ];
    for (const [re, id] of declaredMap) if (re.test(name)) return id;
    // Declared name didn't match a known id (could be a bundled third-party component's
    // license further down the file) — fall through to full-text matching below.
  }

  if (has(/BSD Zero-?Clause License/i)) return '0bsd';
  if (has(/unencumbered software released into the public domain/i)) return 'unlicense';
  if (has(/DO WHAT THE FUCK YOU WANT TO PUBLIC LICENSE/i)) return 'wtfpl';
  if (has(/CC0 1\.0 Universal|Creative Commons Zero/i)) return 'cc0-1.0';
  if (has(/Permission to use, copy, modify, and\/?or distribute this software for any purpose with or without fee/i))
    return 'isc';
  if (has(/Apache License[\s\S]{0,40}Version 2\.0/i)) return 'apache-2.0';
  if (has(/Mozilla Public License[\s\S]{0,20}2\.0/i)) return 'mpl-2.0';
  if (has(/GNU Affero General Public License/i)) return has(/version 3/i) ? 'agpl-3.0' : null;
  if (has(/GNU Lesser General Public License/i))
    return has(/version 3/i) ? 'lgpl-3.0' : has(/version 2\.1/i) ? 'lgpl-2.1' : null;
  if (has(/GNU General Public License/i)) return has(/version 3/i) ? 'gpl-3.0' : has(/version 2/i) ? 'gpl-2.0' : null;
  if (has(/Redistributions of source code must retain[\s\S]*Redistributions in binary form/i))
    return has(/Neither the name/i) ? 'bsd-3-clause' : 'bsd-2-clause';
  if (has(/This software is provided ['"]as-is['"], without any express or implied warranty/i)) return 'zlib';
  if (has(/Permission is hereby granted, free of charge, to any person obtaining a copy/i)) return 'mit';
  return null;
}

// ── Version normalisation (mirrors upgrade.ts) ────────────────────────────────

function versionNormalize(tag: string): string {
  const clean = tag.replace(/^v/, '');
  const dateMatch = clean.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateMatch) return `${dateMatch[1]}${dateMatch[2]}${dateMatch[3]}.0.0`;
  const coerced = semver.clean(clean) ?? clean;
  if (semver.valid(coerced)) return coerced;
  const zeroPadded = clean.match(/^(\d+)\.0+(\d+)$/);
  if (zeroPadded) return `${zeroPadded[1]}.0.${zeroPadded[2]}`;
  return semver.coerce(clean)?.version ?? clean;
}

// ── Filename inference helpers ────────────────────────────────────────────────

// Detects an OS version floor embedded in the filename — e.g. "win7"/"windows7" for a
// build that specifically targets older Windows, or a macOS deployment target like
// "macos-10.15"/"macos-universal-10.13". Returns {} (no constraint) when there's no
// clear hint: per registry convention, omitting min means "supports all versions",
// which must stay the default. Never guess a number — only a literal version token
// adjacent to the OS name counts as evidence.
function inferVersionConstraint(filename: string, systemType: string): { min?: number } {
  const f = filename.toLowerCase();
  if (systemType === 'win') {
    const m = f.match(/(?<![a-z])win(?:dows)?[-_]?(7|8(?:\.1)?|10|11)(?![0-9])/);
    if (m) return { min: parseFloat(m[1]) };
  }
  if (systemType === 'mac') {
    // Major version is constrained to 10-16 (the real macOS range) rather than any 1-2
    // digit number — otherwise a semver tail like "-mac-1.0.0.zip" misreads "1.0" as a
    // macOS deployment target. This also makes the old "(?!\d)" date guard unnecessary.
    const m = f.match(/(?:macos|osx|mac)(?:[-_](?:universal|intel|arm64))?[-_](1[0-6](?:\.\d{1,2})?)(?!\d)/);
    if (m) return { min: parseFloat(m[1]) };
  }
  // Linux intentionally excluded: distro version tokens (ubuntu-20.04, fedora-38) reflect
  // the build environment's glibc floor, not a single "Linux OS version" a user can reason
  // about the same way — flagging this to a human is more honest than a fabricated number.
  return {};
}

// Plain `\b` treats underscore as a word character, so it fails to find a boundary in
// underscore-delimited filenames like "MixCompare_VST3_AU_AAX_CLAP_Standalone.zip" — there's
// no transition between "_" and "au" for \b to match. Bound tokens against [a-z0-9] instead so
// hyphens, underscores, dots, and spaces all count as real separators. `filename` is assumed
// already lowercased by the caller.
function tok(pattern: string): RegExp {
  return new RegExp(`(?<![a-z0-9])(?:${pattern})(?![a-z0-9])`);
}

function inferSystems(filename: string): Array<{ type: string; min?: number }> {
  const f = filename.toLowerCase();
  const found = new Set<string>();
  // Left-boundary guard is required: plain substring matching on "win" false-positives
  // inside product names like "airWINdows-..." and "clang-arm64-darWIN.dmg". The right
  // side must allow a digit too ("win32", "win64" have no separator before the number).
  // "w32"/"w64" is a shorthand some CI configs use in place of the full "win32"/"win64".
  if (/(?<![a-z])win(?:dows)?(?=[-_.0-9]|$)|\.exe$|\.msi$/.test(f) || tok('w(?:32|64)').test(f)) found.add('win');
  // Same left+right boundary discipline as "win" above — without a right boundary, "mac"
  // as a bare prefix false-positives inside any longer word starting with those three
  // letters that happens to follow a separator, e.g. "time-machine_linux-x64.tar.xz"
  // matching on "-mac" from "-machine" and wrongly tagging a Linux-only asset as also Mac.
  if (/(?<![a-z])mac(?:os)?(?=[-_.0-9]|$)|darwin|\.dmg$|\.pkg$/.test(f) || tok('osx').test(f)) found.add('mac');
  // Distro names (ubuntu, debian, fedora) are common in CI-built asset names and carry
  // no literal "linux" substring — without this, those assets are silently dropped below.
  // "lin"/"lin64"/"lin32" is a shorthand some CI configs use in place of "linux".
  // .flatpak/.snap are sandboxed desktop-app package formats, Linux-only by design (common
  // for GNOME/GTK apps distributed via Flathub) — without these, a Flatpak/Snap-only release
  // has no platform any extension here recognizes, and the whole build gets silently dropped
  // as "no system/platform recognized" rather than added with contains flagged for review.
  if (
    /linux[-_.]|[-_.]linux|ubuntu|debian|fedora|\.deb$|\.rpm$|\.appimage$|\.flatpak$|\.snap$/.test(f) ||
    tok('lin(?:32|64)?').test(f)
  )
    found.add('linux');
  return [...found].map(type => ({ type, ...inferVersionConstraint(filename, type) }));
}

// Returns archs: null when the filename indicates an architecture with no corresponding
// registry value (e.g. RISC-V) — callers must skip the asset rather than guess. Returns
// confident: false when no filename hint was found at all and ['x64'] is just a fallback
// guess — callers should treat this as unverified rather than asserting it as fact,
// especially for macOS builds which are frequently universal (arm64 + x64) binaries with
// no architecture token in the filename.
function inferArchitectures(filename: string): { archs: string[] | null; confident: boolean } {
  const f = filename.toLowerCase();
  if (/riscv|risc-v/.test(f)) return { archs: null, confident: true };
  if (/universal|fat/.test(f)) return { archs: ['arm64', 'x64'], confident: true };
  if (/arm64ec/.test(f)) return { archs: ['arm64ec'], confident: true }; // check before the broader arm64 pattern below
  if (/arm64|aarch64|[-_]m[123][-_.]|apple[._-]?silicon/.test(f) || tok('arm').test(f))
    return { archs: ['arm64'], confident: true };
  if (/armhf|armv7|arm32/.test(f)) return { archs: ['arm32'], confident: true };
  // "win32"/"win64" are matched further below, but the OS name spelled out in full immediately
  // followed by a bit-width (e.g. pierreguillot/Camomile's "CamomileWindows32.zip" vs
  // "...Windows64.zip", or "...Linux64.zip") isn't: the extra letters between the short OS
  // token and the digits ("dows", "ux") break that literal substring match, so this unambiguous
  // pairing silently fell through to the unconfident x64 default with no warning surfaced
  // (the warning itself was also mac-only until this same investigation). Matched here, before
  // the ambiguous x86 block, since an OS name immediately followed by "32"/"64" is never
  // ambiguous the way a bare "x86" is.
  const osBits = f.match(/(?:win(?:dows)?|linux|mac(?:os)?)[-_]?(32|64)(?![0-9])/);
  if (osBits) return { archs: [osBits[1] === '64' ? 'x64' : 'x32'], confident: true };
  // Bare "x86" (no i386/i686/32bit/win32 qualifier) is ambiguous by name alone, but in
  // practice release filenames overwhelmingly use it to mean x86-64 now, not 32-bit — e.g.
  // ZL-Audio's "*-Linux-x86.zip" ships an x86_64-linux VST3 binary. Only tokens that
  // unambiguously signal 32-bit route to the x32 branch below.
  if (
    /x86[_-]64|amd64|64[-_]?bit/.test(f) ||
    tok('x64').test(f) ||
    (tok('x86').test(f) && !/i[3-6]86|32[-_]?bit|win32/.test(f))
  )
    return { archs: ['x64'], confident: true };
  if (/i[3-6]86|32[-_]?bit|win32/.test(f) || tok('x32').test(f)) return { archs: ['x32'], confident: true };
  return { archs: ['x64'], confident: false }; // safe default; flag for review if no hint found
}

// `systems` determines the correct per-platform VST2 enum value: the registry
// distinguishes vst (Mac), so (Linux), and dll (Windows) — there is no generic "vst2".
function inferContainsFromFilename(filename: string, systems: Array<{ type: string }>): string[] {
  const f = filename.toLowerCase();
  const formats: string[] = [];
  const platform = systems[0]?.type;
  const vst2Value = platform === 'linux' ? 'so' : platform === 'win' ? 'dll' : 'vst';

  if (/vst3/.test(f)) formats.push('vst3');
  if (tok('vst2').test(f) || (tok('vst').test(f) && !f.includes('vst3'))) formats.push(vst2Value);
  if (tok('au').test(f) || tok('audiounit').test(f)) formats.push('component');
  if (tok('clap').test(f)) formats.push('clap');
  if (tok('lv2').test(f)) formats.push('lv2');
  // `tok('aax')` requires a non-alnum boundary on both sides, so it never matches a bare
  // ".aaxplugin" asset (e.g. "BeatMD-win.aaxplugin", seen on pauljonescodes/beat-md) — "aax" is
  // immediately followed by "plugin" with no separator. Checking the literal extension too
  // catches this compound-extension case that the generic token boundary can't.
  if (tok('aax').test(f) || /\.aaxplugin$/.test(f)) formats.push('aax');
  return formats;
}

// README/release-body prose is the least reliable signal — a README mentioning "VST3"
// but not spelling out "Audio Unit" produces a plausible-looking but incomplete answer
// that (if trusted) would block the more authoritative archive-content inspection in
// main() from ever running. Callers should only reach for this after filename inference
// AND archive inspection have both come up empty (e.g. non-extractable installer types).
function inferContainsFromText(releaseBody: string, readme: string, systems: Array<{ type: string }>): string[] {
  const formats: string[] = [];
  const platform = systems[0]?.type;
  const vst2Value = platform === 'linux' ? 'so' : platform === 'win' ? 'dll' : 'vst';
  const context = (releaseBody + ' ' + readme.slice(0, 5000)).toLowerCase();
  if (tok('vst3').test(context)) formats.push('vst3');
  if (tok('vst2').test(context) || (tok('vst').test(context) && !formats.includes('vst3'))) formats.push(vst2Value);
  if (tok('clap').test(context)) formats.push('clap');
  if (tok('lv2').test(context)) formats.push('lv2');
  if (/\baudio\s*unit\b/.test(context)) formats.push('component');
  return formats;
}

function inferFileType(filename: string): string {
  return /\.(exe|msi|dmg|pkg|deb|rpm|appimage|flatpak|snap)$/i.test(filename) ? 'installer' : 'archive';
}

// ── Archive content inspection ──────────────────────────────────────────────────
// Filename regexes are the first line of defense but are frequently silent for single-archive
// builds (common with DPF/JUCE projects) that carry no platform or format hint in the name at
// all. When we already have the asset downloaded, extract it and inspect what's really inside —
// far more reliable than guessing from the filename or README prose. Covers zip/tar archives
// plus the common installer formats (.pkg, .dmg, .deb, .exe, .msi) using standard CLI tools.
// Each installer extractor is gated behind a tool-availability check and degrades gracefully
// (falls back to the pre-existing filename/text-inference path) if the tool isn't installed —
// this script may run on machines without pkgutil/hdiutil (Linux) or without 7z/innoextract.
// Bare binaries/content files uploaded directly as the release asset, with no zip/archive
// wrapper — most often a Windows VST3 shipped as a single, un-bundled DLL that just keeps the
// ".vst3" extension (a real macOS .vst3/.component is always a directory bundle, which GitHub
// can't accept as a single release asset, so a bare file here can only be this Windows case;
// VST2 .dll/.dylib/.so are flat files on every platform, so those are always bare). ".sf2" is
// a single self-contained SoundFont file, routinely uploaded bare the same way.
const BARE_BINARY_ASSET = /\.(vst3|dll|dylib|so|clap|sf2)$/i;
const INSPECTABLE_ASSET = new RegExp(
  `\\.(zip|tar\\.gz|tgz|tar\\.xz|tar\\.bz2|pkg|dmg|deb|exe|msi|7z)$|${BARE_BINARY_ASSET.source}`,
  'i',
);

function commandExists(cmd: string): boolean {
  try {
    execSync(`command -v ${cmd}`, { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

function dirHasFiles(dir: string): boolean {
  try {
    return (
      execSync(`find "${dir}" -type f 2>/dev/null | head -1`, { encoding: 'utf8', stdio: 'pipe' }).trim().length > 0
    );
  } catch {
    return false;
  }
}

// macOS installer package. Handles both a single flat pkg (Bom/Payload/PackageInfo directly)
// and a "product archive" wrapping multiple named sub-packages (e.g. App.pkg, VST3.pkg,
// AU.pkg), each with its own gzip+cpio Payload — merges every Payload's contents into outDir.
function expandPkg(pkgPath: string, outDir: string): boolean {
  if (!commandExists('pkgutil') || !commandExists('cpio')) return false;
  const expandDir = `${outDir}-pkgexpand`;
  try {
    // execFileSync — pkgPath may be a nested pkg discovered inside an already-extracted
    // directory (see expandNestedPkgs), so its name isn't under our control.
    execFileSync('pkgutil', ['--expand', pkgPath, expandDir], { stdio: 'pipe' });
  } catch {
    return false; // not a valid pkg, or pkgutil unavailable for this variant
  }
  mkdirSync(outDir, { recursive: true });
  const payloads = [
    path.join(expandDir, 'Payload'), // flat/single-component pkg
    ...(() => {
      try {
        return execSync(`find "${expandDir}" -mindepth 1 -maxdepth 1 -iname "*.pkg" -type d`, {
          encoding: 'utf8',
          stdio: 'pipe',
        })
          .split('\n')
          .filter(Boolean)
          .map(sub => path.join(sub, 'Payload'));
      } catch {
        return [];
      }
    })(),
  ];
  for (const payload of payloads) {
    if (!existsSync(payload)) continue;
    try {
      execSync(`sh -c 'gunzip -c "${payload}" | (cd "${outDir}" && cpio -id --quiet)'`, { stdio: 'pipe' });
    } catch {
      /* individual sub-package payload failed to decompress — skip, keep the rest */
    }
  }
  execFileSync('rm', ['-rf', expandDir], { stdio: 'pipe' });
  return dirHasFiles(outDir);
}

// Recursively expand any bare .pkg files left inside an already-extracted directory (common
// when a zip or dmg wraps a .pkg installer instead of shipping raw plugin bundles directly).
function expandNestedPkgs(dir: string): void {
  if (!commandExists('pkgutil')) return;
  try {
    const pkgFiles = execSync(`find "${dir}" -maxdepth 3 -iname "*.pkg" -type f`, { encoding: 'utf8', stdio: 'pipe' })
      .split('\n')
      .filter(Boolean);
    for (const pkgFile of pkgFiles) {
      const subOut = `${pkgFile}-expanded`;
      if (expandPkg(pkgFile, subOut)) {
        execFileSync('cp', ['-R', `${subOut}/.`, dir], { stdio: 'pipe' });
      }
      execFileSync('rm', ['-rf', subOut], { stdio: 'pipe' });
    }
  } catch {
    /* best-effort — leave dir as-is if nested pkgs can't be found/expanded */
  }
}

// Recursively expand any bare .zip files left inside an already-extracted directory — some
// release assets are a zip whose only content is another zip (seen on gmoican/PunkEq's macOS
// asset: the release .zip contains just "Punk EQ-0.1.0-macOS.zip", one level deeper than a
// plain zip). Without this, inspection only ever sees the inner zip as an opaque file and falls
// back to unconfirmed guesses for contains/architectures. Bounded to a few levels since this is
// a defensive unwrap, not an expectation of arbitrarily deep nesting.
function expandNestedZips(dir: string, depth = 0): void {
  if (depth >= 3) return;
  try {
    const zipFiles = execSync(`find "${dir}" -maxdepth 3 -iname "*.zip" -type f`, { encoding: 'utf8', stdio: 'pipe' })
      .split('\n')
      .filter(Boolean);
    for (const zipFile of zipFiles) {
      try {
        execSync(`unzip -oq "${zipFile}" -d "${dir}"`, { stdio: 'pipe' });
        execFileSync('rm', ['-f', zipFile], { stdio: 'pipe' });
      } catch {
        /* leave this zip in place if it can't be extracted */
      }
    }
    if (zipFiles.length > 0) expandNestedZips(dir, depth + 1);
  } catch {
    /* best-effort — leave dir as-is if nested zips can't be found/expanded */
  }
}

// Recursively expand any bare installer .exe/.msi files left inside an already-extracted
// directory — some zip release assets don't ship the raw plugin bundle directly, they wrap a
// full installer executable instead (seen on mattanikiej/party-panda-univibe's Windows asset:
// "PartyPanda1.0.1-windows-installer.zip" contains only "PartyPanda1.0.1-windows-installer.exe",
// an Inno Setup installer whose payload is the actual .vst3). Without this, inspection only
// ever sees the opaque installer .exe (no bundle extension to match) and falls back to an
// unconfirmed guess for contains, exactly like the un-inspectable top-level installer types
// this same expand* family already handles when they're the release asset directly — this just
// extends that handling one level deeper. Bounded depth for the same reason as
// expandNestedZips: a defensive unwrap, not an expectation of arbitrarily deep nesting.
function expandNestedInstallers(dir: string, depth = 0): void {
  if (depth >= 3) return;
  try {
    const exeFiles = execSync(`find "${dir}" -maxdepth 3 -iname "*.exe" -type f`, { encoding: 'utf8', stdio: 'pipe' })
      .split('\n')
      .filter(Boolean);
    const msiFiles = execSync(`find "${dir}" -maxdepth 3 -iname "*.msi" -type f`, { encoding: 'utf8', stdio: 'pipe' })
      .split('\n')
      .filter(Boolean);
    let expandedAny = false;
    for (const exeFile of exeFiles) {
      const subOut = `${exeFile}-expanded`;
      if (expandExe(exeFile, subOut)) {
        execFileSync('cp', ['-R', `${subOut}/.`, dir], { stdio: 'pipe' });
        execFileSync('rm', ['-f', exeFile], { stdio: 'pipe' });
        expandedAny = true;
      }
      execFileSync('rm', ['-rf', subOut], { stdio: 'pipe' });
    }
    for (const msiFile of msiFiles) {
      const subOut = `${msiFile}-expanded`;
      if (expandMsi(msiFile, subOut)) {
        execFileSync('cp', ['-R', `${subOut}/.`, dir], { stdio: 'pipe' });
        execFileSync('rm', ['-f', msiFile], { stdio: 'pipe' });
        expandedAny = true;
      }
      execFileSync('rm', ['-rf', subOut], { stdio: 'pipe' });
    }
    if (expandedAny) expandNestedInstallers(dir, depth + 1);
  } catch {
    /* best-effort — leave dir as-is if nested installers can't be found/expanded */
  }
}

// macOS disk image. Mounts read-only and copies the volume contents out rather than reading
// in place, so the mount can be detached immediately (avoids leaking mounted volumes across a
// batch fetch run). Some dmgs show an embedded software-license prompt on attach; `yes |`
// auto-accepts it so the command doesn't hang waiting for interactive input.
function expandDmg(dmgPath: string, outDir: string): boolean {
  if (!commandExists('hdiutil')) return false;
  const mountPoint = `/tmp/oas-fetch-dmg-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  try {
    mkdirSync(mountPoint, { recursive: true });
    execSync(`yes | hdiutil attach "${dmgPath}" -nobrowse -mountpoint "${mountPoint}"`, { stdio: 'pipe' });
  } catch {
    return false; // not a mountable disk image, or hdiutil unavailable
  }
  try {
    mkdirSync(outDir, { recursive: true });
    execSync(`cp -R "${mountPoint}/." "${outDir}"`, { stdio: 'pipe' });
  } catch {
    return false;
  } finally {
    try {
      execSync(`hdiutil detach "${mountPoint}" -force`, { stdio: 'pipe' });
    } catch {
      /* best-effort unmount */
    }
    try {
      execSync(`rmdir "${mountPoint}"`, { stdio: 'pipe' });
    } catch {
      /* leftover empty mountpoint dir, not worth failing over */
    }
  }
  expandNestedPkgs(outDir); // dmg may wrap a .pkg rather than shipping raw bundles
  return dirHasFiles(outDir);
}

// Linux .deb package: ar extracts the control/data/debian-binary members, data.tar.* holds
// the actual filesystem payload. `tar -xf` auto-detects compression (gz/xz/zst) on both GNU
// tar and macOS's bsdtar, so no need to branch on the specific data.tar extension.
function expandDeb(debPath: string, outDir: string): boolean {
  if (!commandExists('ar')) return false;
  mkdirSync(outDir, { recursive: true });
  try {
    execSync(`sh -c 'cd "${outDir}" && ar x "${debPath}" && tar -xf data.tar.*'`, { stdio: 'pipe' });
    return dirHasFiles(outDir);
  } catch {
    return false;
  }
}

// Windows installer (.exe). Most JUCE/CMake projects package with Inno Setup — innoextract
// handles that directly. Some installer frameworks (NSIS, self-extracting archives) aren't
// Inno Setup at all, and even genuine Inno Setup installers can use a loader revision newer
// than the locally-installed innoextract supports — 7z is a broader (if less precise) fallback
// that handles NSIS archives with an explicit -tnsis type hint.
function expandExe(exePath: string, outDir: string): boolean {
  mkdirSync(outDir, { recursive: true });
  if (commandExists('innoextract')) {
    try {
      execSync(`innoextract -m -d "${outDir}" "${exePath}"`, { stdio: 'pipe' });
      if (dirHasFiles(outDir)) return true;
    } catch {
      /* not an Inno Setup installer, or unsupported loader revision — try 7z instead */
    }
  }
  if (commandExists('7z')) {
    try {
      execSync(`7z x "${exePath}" -o"${outDir}" -y`, { stdio: 'pipe' });
      if (dirHasFiles(outDir)) return true;
    } catch {
      /* fall through to explicit NSIS type hint */
    }
    try {
      execSync(`7z x -tnsis "${exePath}" -o"${outDir}" -y`, { stdio: 'pipe' });
      if (dirHasFiles(outDir)) return true;
    } catch {
      /* neither generic nor NSIS-typed extraction worked — likely InstallShield or similar,
         needs the manual packaging-script/CI-workflow fallback documented in AGENTS.md */
    }
  }
  return false;
}

// Windows installer (.msi). 7z understands the MSI/OLE compound file format directly.
function expandMsi(msiPath: string, outDir: string): boolean {
  if (!commandExists('7z')) return false;
  mkdirSync(outDir, { recursive: true });
  try {
    execSync(`7z x "${msiPath}" -o"${outDir}" -y`, { stdio: 'pipe' });
    return dirHasFiles(outDir);
  } catch {
    return false;
  }
}

// .7z archive — a plain, passively-parsed archive format (no execution involved, same trust
// boundary as zip/tar), just less common than zip for release assets. 7z is already a hard
// dependency for exe/msi extraction above, so no new tool requirement.
function expand7z(archivePath: string, outDir: string): boolean {
  if (!commandExists('7z')) return false;
  mkdirSync(outDir, { recursive: true });
  try {
    execSync(`7z x "${archivePath}" -o"${outDir}" -y`, { stdio: 'pipe' });
    return dirHasFiles(outDir);
  } catch {
    return false;
  }
}

function extractArchive(tmpFile: string, filename: string): string | null {
  const dir = `${tmpFile}-extracted`;
  try {
    if (/\.zip$/i.test(filename)) {
      mkdirSync(dir, { recursive: true });
      try {
        execSync(`unzip -oq "${tmpFile}" -d "${dir}"`, { stdio: 'pipe' });
      } catch {
        // unzip exits 1 for warnings it still recovers from — e.g. "appears to use backslashes
        // as path separators" (routine for Windows-built zips) — with the archive otherwise
        // fully extracted. Swallow here and let the dirHasFiles check below be the real signal,
        // same as every other archive type in this function; letting this propagate to the
        // outer catch previously discarded a real, complete extraction over a mere warning,
        // silently falling back to unreliable prose-based format inference instead.
      }
      expandNestedPkgs(dir); // zip may wrap a .pkg rather than shipping raw bundles
      expandNestedZips(dir); // zip may wrap another zip rather than shipping raw bundles
      expandNestedInstallers(dir); // zip may wrap a full installer .exe/.msi rather than a raw bundle
    } else if (/\.tar\.gz$|\.tgz$/i.test(filename)) {
      mkdirSync(dir, { recursive: true });
      execSync(`tar -xzf "${tmpFile}" -C "${dir}"`, { stdio: 'pipe' });
    } else if (/\.tar\.xz$/i.test(filename)) {
      mkdirSync(dir, { recursive: true });
      execSync(`tar -xJf "${tmpFile}" -C "${dir}"`, { stdio: 'pipe' });
    } else if (/\.tar\.bz2$/i.test(filename)) {
      mkdirSync(dir, { recursive: true });
      execSync(`tar -xjf "${tmpFile}" -C "${dir}"`, { stdio: 'pipe' });
    } else if (/\.pkg$/i.test(filename)) {
      if (!expandPkg(tmpFile, dir)) return null;
    } else if (/\.dmg$/i.test(filename)) {
      if (!expandDmg(tmpFile, dir)) return null;
    } else if (/\.deb$/i.test(filename)) {
      if (!expandDeb(tmpFile, dir)) return null;
    } else if (/\.msi$/i.test(filename)) {
      if (!expandMsi(tmpFile, dir)) return null;
    } else if (/\.exe$/i.test(filename)) {
      if (!expandExe(tmpFile, dir)) return null;
    } else if (/\.7z$/i.test(filename)) {
      if (!expand7z(tmpFile, dir)) return null;
    } else if (BARE_BINARY_ASSET.test(filename)) {
      // No archive to unpack — the asset *is* the binary. Drop it into a directory under its
      // original name so inspectExtractedDir's name/`file`-based matching (which expects a
      // directory to search) can find and identify it like any other extracted candidate.
      mkdirSync(dir, { recursive: true });
      copyFileSync(tmpFile, path.join(dir, filename));
    } else {
      // .appimage is deliberately not handled here: every other format above is inspected by
      // passively parsing the file (pkgutil, ar/tar, 7z, innoextract — none of them run the
      // downloaded binary). The standard way to read an AppImage's contents is
      // `--appimage-extract`, which *executes* its bundled runtime stub — a materially
      // different trust boundary for a script that processes untrusted community submissions.
      // Falls back to the existing filename/text-inference path and the manual AGENTS.md
      // steps, same as before this function existed.
      return null;
    }
    // Some Windows-built zips store bogus Unix permission bits in their central directory
    // (e.g. a directory entry with mode 644 — no execute bit), which unzip faithfully restores.
    // A directory without +x can't be traversed even by its owner, so `find` silently sees zero
    // files below it and the whole extraction looks empty even though it succeeded — force
    // sane, readable/traversable permissions on everything we just extracted before checking.
    try {
      execSync(`chmod -R u+rwX "${dir}"`, { stdio: 'pipe' });
    } catch {
      /* best-effort — if chmod itself fails, dirHasFiles below will correctly report empty */
    }
    return dirHasFiles(dir) ? dir : null;
  } catch {
    return null; // corrupt archive, unsupported compression, or required tool unavailable —
    // caller falls back to filename/text inference
  }
}

interface ArchiveInspection {
  platforms: Set<string>;
  formats: Set<string>; // '__vst2__' stands in for the platform-specific vst/so/dll value
  macArchitectures: Set<string>;
  // Linux/Windows builds targeting non-desktop hardware (e.g. MOD Devices' MOD Duo/Duo X/Dwarf
  // pedals) carry no architecture hint in the filename at all — "modduo-new.zip" gives no clue
  // it's 32-bit ARM, "modduox-new.zip"/"moddwarf-new.zip" no clue they're 64-bit ARM, so all
  // three previously defaulted to the generic "unconfirmed, assume x64" guess. `file` on the
  // extracted .so/.exe is authoritative here just like it already is for mac.
  linuxArchitectures: Set<string>;
  winArchitectures: Set<string>;
  // Loose (not inside a plugin bundle) win .exe / linux ELF binaries that look like they
  // could be the standalone app entry point, but weren't unambiguous enough to auto-tag as
  // the 'exe'/'elf' format — surfaced to the reviewer rather than guessed.
  standaloneCandidates: string[];
}

// Installer-bundled helper binaries that are never the plugin's own standalone entry point —
// filtered out so they don't get misidentified as (or dilute confidence in) the real one.
const HELPER_BINARY_PATTERN = /unins|uninstall|vc_?redist|dotnetfx|dotnet-|winsparkle|crashpad|updater?\b|setup/i;

// Release assets that are never a plugin/app binary themselves — checksum manifests, signature
// files, and plain-text/doc sidecars a release commonly ships alongside the real downloads.
// Excluded outright rather than run through system/format inference, which would otherwise
// occasionally misfire and tag one of these with a `contains` value (seen with a
// `SHA256SUMS-macOS.txt` that got auto-tagged `contains: [vst3]`). `.sh`/`.json` build/install
// helper scripts hit the exact same failure: a name like `build-osx.sh` or `mac_installer.sh`
// carries an OS-name substring that `inferSystems` happily matches, so a handful-of-bytes shell
// script ends up with a full systems/architectures/contains entry guessed from README text.
const NON_BINARY_ASSET_PATTERN =
  /^SHA(256|1|512)SUMS|^CHECKSUMS|\.(txt|md|sig|asc|sha256|sha1|pem|crt|yml|yaml|sh|json)$/i;

function inspectExtractedDir(dir: string): ArchiveInspection {
  const result: ArchiveInspection = {
    platforms: new Set(),
    formats: new Set(),
    macArchitectures: new Set(),
    linuxArchitectures: new Set(),
    winArchitectures: new Set(),
    standaloneCandidates: [],
  };
  let listing = '';
  try {
    // Exclude symlinks: some JUCE/CMake post-build steps leave a broken symlink named
    // "Plugin.vst3" pointing at the local machine's system plugin folder — a leftover of a
    // local "install" step, not a real bundle. Only a genuine directory counts as evidence.
    listing = execSync(`find "${dir}" -not -type l`, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).toLowerCase();
  } catch {
    return result;
  }
  if (/\.vst3(\/|$)/m.test(listing)) result.formats.add('vst3');
  if (/\.component(\/|$)/m.test(listing)) result.formats.add('component');
  if (/\.clap(\/|$)/m.test(listing)) result.formats.add('clap');
  if (/\.lv2(\/|$)/m.test(listing)) result.formats.add('lv2');
  if (/\.aaxplugin(\/|$)/m.test(listing)) result.formats.add('aax');
  // The trailing (\/|$) boundary already rejects ".vst3" on its own (nothing between "vst" and
  // the separator/end-of-line) — an extra "no .vst3 anywhere in the whole listing" check used
  // to sit here, but that's a *global* condition, not scoped to this match: it incorrectly
  // suppressed vst2 detection whenever a vst3 bundle existed anywhere else in the same archive,
  // which is the common case for plugins that ship both formats side by side.
  if (/\.vst(\/|$)/m.test(listing)) result.formats.add('__vst2__');
  // ".app" is unambiguous — only a macOS Standalone build produces one, unlike bare Windows
  // .exe or extensionless Linux binaries, which could just as easily be an installer helper
  // or a build tool bundled alongside the real plugin.
  if (/\.app(\/|$)/m.test(listing)) result.formats.add('app');
  // SFZ/SF2 are plain-text/data sample-library formats, not compiled binaries — a sampler
  // that supports the format can load them the same way on every OS, so unlike every format
  // above there's no platform-specific binary to run `file` on at all.
  if (/\.sfz$/m.test(listing)) result.formats.add('sfz');
  if (/\.sf2$/m.test(listing)) result.formats.add('sf2');
  const inBundle = (f: string) => /\.vst3\/|\.component\/|\.clap\/|\.lv2\//i.test(f);

  // Inspect real binaries for platform/architecture — `file` reads magic bytes, so this is
  // authoritative even when directory/file names give no hint at all.
  try {
    // Bundle payload binaries (e.g. a Windows VST3's actual PE32 DLL, which conventionally
    // keeps the bundle's own name + ".vst3" extension rather than ".dll") are matched by
    // name here too — zip extraction routinely drops the executable bit for these, so relying
    // on -perm +111 alone leaves them invisible to `file` and the platform undetected entirely.
    // A macOS bundle's own executable (Contents/MacOS/<name>) is the same story but worse: by
    // convention it has *no extension at all* (just the bundle's product name), so it can't be
    // caught by any of the name patterns above either — only the Contents/MacOS/ path shape
    // identifies it, hence the dedicated -path clause.
    const candidates = execSync(
      `find "${dir}" -type f \\( -name "*.dylib" -o -name "*.so" -o -name "*.dll" -o -name "*.exe" -o -name "*.vst3" -o -name "*.component" -o -name "*.clap" -o -name "*.lv2" -o -path "*/Contents/MacOS/*" -o -perm +111 \\)`,
      { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] },
    )
      .split('\n')
      .filter(Boolean)
      .slice(0, 20); // cap — large bundles can contain hundreds of resource files
    const winStandaloneCandidates: string[] = [];
    const linuxStandaloneCandidates: string[] = [];
    for (const f of candidates) {
      let info = '';
      try {
        // execFileSync (no shell) rather than execSync — NSIS-extracted installers routinely
        // produce paths like "$_16_/element.exe" or "$PLUGINSDIR/foo.dll", and a shell-form
        // command would expand "$_16_"/"$PLUGINSDIR" as an (undefined, empty-string) variable
        // reference, silently breaking the lookup for exactly that file.
        info = execFileSync('file', ['-b', f], { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
      } catch {
        continue;
      }
      if (/mach-o/i.test(info)) {
        result.platforms.add('mac');
        if (/\barm64\b/.test(info)) result.macArchitectures.add('arm64');
        if (/\bx86_64\b/.test(info)) result.macArchitectures.add('x64');
      } else if (/pe32\+?\s+executable|ms-dos/i.test(info)) {
        result.platforms.add('win');
        if (/\baarch64\b/i.test(info)) result.winArchitectures.add('arm64');
        else if (/pe32\+/i.test(info)) result.winArchitectures.add('x64');
        else if (/pe32\s+executable/i.test(info)) result.winArchitectures.add('x32');
        if (/\.exe$/i.test(f) && !inBundle(f) && !HELPER_BINARY_PATTERN.test(path.basename(f)))
          winStandaloneCandidates.push(path.relative(dir, f));
      } else if (/elf\s+\d+-bit/i.test(info)) {
        result.platforms.add('linux');
        // ARM must be checked before the bit-width fallback: "ARM aarch64" (64-bit) and bare
        // "ARM" (32-bit, e.g. MOD Devices' MOD Duo pedal) both need telling apart from x86.
        if (/\baarch64\b/i.test(info)) result.linuxArchitectures.add('arm64');
        else if (/\barm\b/i.test(info)) result.linuxArchitectures.add('arm32');
        else if (/x86-64/i.test(info)) result.linuxArchitectures.add('x64');
        else if (/\b80386\b/i.test(info)) result.linuxArchitectures.add('x32');
        // Linux CLAP/VST2 plugins are a single flat ELF file (unlike the directory bundles
        // used by vst3/component/lv2), so they'd otherwise slip past inBundle() and look like
        // a standalone candidate — exclude by extension instead. Shared libraries following the
        // SONAME convention (libfoo.so.1.17.3) keep a version suffix after ".so", so a bare
        // ".so$" check misses them and they get mistaken for a second standalone candidate.
        if (!inBundle(f) && !HELPER_BINARY_PATTERN.test(path.basename(f)) && !/\.(so(\.\d+)*|clap)$/i.test(f))
          linuxStandaloneCandidates.push(path.relative(dir, f));
      }
    }
    // Only auto-tag when there's exactly one plausible candidate — with more than one, guessing
    // which is the real entry point is no better than the filename/text inference this is meant
    // to replace, so surface the list instead of picking one.
    if (winStandaloneCandidates.length === 1) result.formats.add('exe');
    else if (winStandaloneCandidates.length > 1)
      result.standaloneCandidates.push(...winStandaloneCandidates.map(f => `win: ${f}`));
    if (linuxStandaloneCandidates.length === 1) result.formats.add('elf');
    else if (linuxStandaloneCandidates.length > 1)
      result.standaloneCandidates.push(...linuxStandaloneCandidates.map(f => `linux: ${f}`));
  } catch {
    /* find/file unavailable, or no matching binaries — inspection is best-effort */
  }
  // A pure sample library has no binary for the loop above to find and `file` — the archive
  // is entirely .sfz/.sf2 plus its audio samples, playable on any OS a compatible sampler runs
  // on. Only fill this in when nothing else was found: a real plugin can legitimately ship an
  // .sfz/.sf2 alongside its vst3/component (e.g. a factory preset), and there the per-binary
  // platform detection above is still the accurate signal, not this blanket fallback.
  if (
    result.platforms.size === 0 &&
    result.formats.size > 0 &&
    [...result.formats].every(f => f === 'sfz' || f === 'sf2')
  ) {
    result.platforms.add('linux').add('mac').add('win');
  }
  return result;
}

// ── Plugin type detection ─────────────────────────────────────────────────────

function inferPluginType(description: string, topics: string[], readme: string): string {
  const text = [description, ...topics, readme.slice(0, 3000)].join(' ').toLowerCase();
  const effectKeywords = [
    'reverb',
    'delay',
    'compressor',
    'limiter',
    ' eq ',
    'equalizer',
    'filter',
    'distortion',
    'saturation',
    'chorus',
    'flanger',
    'phaser',
    'amp sim',
    ' effect',
    ' fx ',
  ];
  const instrumentKeywords = [
    'synth',
    'oscillator',
    'instrument',
    'sampler',
    'drum kit',
    'piano',
    'organ',
    'wavetable',
    'fm synthesis',
    'soundfont',
    'sfz',
    'sample player',
    'macro-oscillator',
  ];
  const effectScore = effectKeywords.filter(kw => text.includes(kw)).length;
  const instrumentScore = instrumentKeywords.filter(kw => text.includes(kw)).length;
  return effectScore > instrumentScore ? 'effect' : 'instrument';
}

// ── Image finder ──────────────────────────────────────────────────────────────

// Matches non-content images (CI badges, sponsor buttons) and video-thumbnail links some
// READMEs use for a "watch the demo" button — both regularly outrank the real UI screenshot
// if picked by first-match-wins alone (e.g. a YouTube thumbnail sitting a few lines above the
// actual screenshot, which is otherwise textually identical to a normal markdown image).
// steinbergmedia.github.io/vst3_dev_portal is the official "VST Compatible" trademark logo
// asset many JUCE/VST3 plugin READMEs embed near the top (required by Steinberg's branding
// terms) — its filename carries no "badge"/"shield" hint, but it's exactly that: a compliance
// badge, not a screenshot, and it otherwise wins as the first README image every time.
const IMAGE_URL_EXCLUDE =
  /badge|shield|ko-?fi|travis|action|workflow|codecov|img\.youtube\.com|ytimg\.com|steinbergmedia\.github\.io/i;
// A URL/path containing one of these is very likely an actual UI screenshot rather than a
// logo, banner, or demo-video thumbnail — used to rank candidates, never to filter them out.
const SCREENSHOT_HINT = /screenshot|preview|screen[-_]?shot|\bui\b|\bgui\b|interface/i;

async function findImageUrl(org: string, repo: string, branch: string, readme: string): Promise<string | null> {
  // Markdown image syntax allows an optional title after the URL, e.g. `![alt](url "title")`
  // — without stripping it, the greedy `[^)]*` tail captures the title text too, corrupting
  // the URL (seen on MichaelHurst97/Noizier, whose 404'd image fetch was actually this).
  // Markdown also tolerates the URL wrapping onto its own line, e.g. `![alt](\nurl\n)` — since
  // `[^)]` matches newlines, the capture group picks up the surrounding whitespace too, which
  // breaks the fetch (seen on EMATech/MidiExplorer, whose real screenshots are linked this way).
  const stripMarkdownTitle = (u: string) => u.trim().replace(/\s+["'][^"']*["']$/, '');
  // GitHub's drag-and-drop README image uploader produces URLs with no file extension at all —
  // either the legacy `github.com/<org>/<repo>/assets/<id>/<uuid>` form or the current
  // `github.com/user-attachments/assets/<uuid>` form — since the real extension only appears
  // after GitHub 302-redirects to a signed S3 URL. These never match the `.(png|jpe?g|...)`
  // suffix the other patterns require, so a plugin whose only README image was pasted this way
  // (the default way of adding an inline screenshot in GitHub's own editor, extremely common —
  // seen on MrMatch246/MidiStrummer) fell through to "no image found" even with a real
  // screenshot right there. `fetch()` follows the redirect transparently, so the URL works
  // exactly like any other once treated as a candidate.
  const GH_ASSET_URL =
    /https?:\/\/github\.com\/(?:[^/\s)]+\/[^/\s)]+\/assets\/\d+\/[\w-]+|user-attachments\/assets\/[\w-]+)/gi;
  const readmeCandidates = [
    ...[...readme.matchAll(/!\[[^\]]*\]\(([^)]+\.(?:png|jpe?g|gif|webp)[^)]*)\)/gi)].map(m => stripMarkdownTitle(m[1])),
    ...[...readme.matchAll(/<img[^>]+src=["']([^"']+\.(?:png|jpe?g|gif|webp))/gi)].map(m => m[1]),
    ...[...readme.matchAll(GH_ASSET_URL)].map(m => m[0]),
  ].filter(u => !IMAGE_URL_EXCLUDE.test(u));

  if (readmeCandidates.length > 0) {
    // First match isn't necessarily the best one — e.g. a "watch the demo" video thumbnail
    // often appears before the real screenshot. Prefer whichever candidate's path/filename
    // looks like an actual screenshot; fall back to the first match otherwise.
    const url = readmeCandidates.find(u => SCREENSHOT_HINT.test(u)) ?? readmeCandidates[0];
    // A README image is sometimes authored as the GitHub *file viewer* URL
    // (github.com/org/repo/blob/branch/path) rather than a raw content link — an easy mistake,
    // since that's the URL the browser's address bar shows when you navigate to the file. It
    // still starts with "https://" so it would otherwise pass straight through as "already a
    // full URL", but fetching it returns GitHub's HTML page wrapper, not the image bytes.
    const blobMatch = url.match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\/([^/]+)\/(.+)$/);
    if (blobMatch)
      return `https://raw.githubusercontent.com/${blobMatch[1]}/${blobMatch[2]}/refs/heads/${blobMatch[3]}/${blobMatch[4]}`;
    if (/^https?:\/\//.test(url)) return url;
    return `https://raw.githubusercontent.com/${org}/${repo}/refs/heads/${branch}/${url.replace(/^\.\//, '')}`;
  }

  // README has no image at all — scan the whole repo tree in one call rather than guessing a
  // fixed list of directory names. Real repos use all sorts of conventions (Source/Assets,
  // ScreenShots, docs/img, a bare root-level file, ...) and GitHub's contents API is
  // case-sensitive, so a short hardcoded directory list misses most of them.
  try {
    const treeData = ghJson(`api repos/${org}/${repo}/git/trees/${branch}?recursive=1`);
    const imgs = (treeData.tree as any[]).filter(
      (f: any) => f.type === 'blob' && /\.(png|jpe?g|gif|webp)$/i.test(f.path) && !IMAGE_URL_EXCLUDE.test(f.path),
    );
    if (imgs.length > 0) {
      const preferred = imgs.find((f: any) => SCREENSHOT_HINT.test(f.path)) ?? imgs[0];
      return `https://raw.githubusercontent.com/${org}/${repo}/refs/heads/${branch}/${preferred.path}`;
    }
  } catch {
    /* tree lookup failed (empty repo, rate limit, etc.) — treat as no image found */
  }
  return null;
}

// ── File download helpers ─────────────────────────────────────────────────────

async function downloadAndConvertImage(url: string, destPath: string): Promise<void> {
  const tmp = `/tmp/oas-fetch-img-${Date.now()}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching image`);
  writeFileSync(tmp, Buffer.from(await res.arrayBuffer()));
  try {
    // JPEG has no alpha channel, so a source PNG with any transparency (a logo/icon on a
    // transparent background, common for repos with no dedicated screenshot) would otherwise
    // flatten onto plain black — often invisible for a dark-lined logo. Composite onto neutral
    // mid-grey instead: a no-op for fully opaque sources (the top image completely occludes it)
    // and readable regardless of whether the transparent art itself is light or dark.
    // scale2ref sizes the solid-colour background to match the source image without needing to
    // know its dimensions ahead of time.
    execSync(
      `ffmpeg -i "${tmp}" -f lavfi -i color=c=0x808080:s=4x4 -filter_complex "[1:v][0:v]scale2ref[bg][img];[bg][img]overlay=format=auto,scale='min(1000,iw)':-1" -q:v 10 -frames:v 1 -update 1 "${destPath}" -y`,
      { stdio: 'pipe' },
    );
  } finally {
    execSync(`rm -f "${tmp}"`);
  }
}

function findAudioUrl(readme: string, org: string, repo: string, branch: string): string | null {
  const urls = [
    ...[...readme.matchAll(/\[[^\]]*\]\(([^)]+\.(?:mp3|wav|ogg|flac|aiff?)(?:\?[^)]*)?)\)/gi)].map(m => m[1]),
    ...[...readme.matchAll(/<(?:audio|source)[^>]+src=["']([^"']+\.(?:mp3|wav|ogg|flac|aiff?))/gi)].map(m => m[1]),
  ].filter(Boolean);
  if (urls.length === 0) return null;
  const url = urls[0];
  if (/^https?:\/\//.test(url)) return url;
  return `https://raw.githubusercontent.com/${org}/${repo}/refs/heads/${branch}/${url.replace(/^\.\//, '')}`;
}

async function downloadAndConvertAudio(url: string, destPath: string): Promise<void> {
  const tmp = `/tmp/oas-fetch-audio-${Date.now()}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching audio`);
  writeFileSync(tmp, Buffer.from(await res.arrayBuffer()));
  try {
    execSync(`ffmpeg -i "${tmp}" -t 10 -c:a flac "${destPath}" -y`, { stdio: 'pipe' });
  } finally {
    execSync(`rm -f "${tmp}"`);
  }
}

// ── YAML serialiser with fixed key ordering ───────────────────────────────────

function dumpYaml(data: any): string {
  return yaml.dump(data, {
    lineWidth: -1,
    sortKeys: (a: string, b: string) => {
      const order = FILE_KEY_ORDER.includes(a) && FILE_KEY_ORDER.includes(b) ? FILE_KEY_ORDER : YAML_KEY_ORDER;
      const ai = order.indexOf(a);
      const bi = order.indexOf(b);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    },
  });
}

// ── Main ──────────────────────────────────────────────────────────────────────

const [repoUrl, versionArg] = process.argv.slice(2);
if (!repoUrl) {
  console.error('Usage: tsx ./src/fetch.ts <github-url> [version-tag]');
  process.exit(1);
}

const urlMatch = repoUrl.match(/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?(?:\/|$)/);
if (!urlMatch) {
  console.error('Error: must be a GitHub URL (https://github.com/org/repo)');
  process.exit(1);
}
const [, ghOrg, ghRepo] = urlMatch;
const pkgOrg = ghOrg.toLowerCase().replace(/_/g, '-');
const pkgRepo = ghRepo.toLowerCase().replace(/_/g, '-');

async function main() {
  console.log(`\nFetching ${ghOrg}/${ghRepo}...`);

  // Repo metadata
  const repoInfo = ghJson(
    `repo view ${ghOrg}/${ghRepo} --json name,description,homepageUrl,licenseInfo,repositoryTopics,defaultBranchRef`,
  );
  const branch: string = repoInfo.defaultBranchRef?.name ?? 'main';
  let license: string = repoInfo.licenseInfo?.key ?? '';
  let licenseDetectedFromText = false;
  if (!license || license === 'other') {
    try {
      const licenseFile = ghJson(`api repos/${ghOrg}/${ghRepo}/license`);
      const licenseText = Buffer.from(licenseFile.content, 'base64').toString();
      const detected = detectLicenseFromText(licenseText);
      if (detected) {
        license = detected;
        licenseDetectedFromText = true;
      }
    } catch {
      /* no license file GitHub could find at all — leave as-is */
    }
  }
  const topics: string[] = (repoInfo.repositoryTopics ?? []).map((t: any) => t.name ?? t.topic?.name).filter(Boolean);

  // README
  let readme = '';
  try {
    const r = ghJson(`api repos/${ghOrg}/${ghRepo}/readme`);
    readme = Buffer.from(r.content, 'base64').toString();
  } catch {
    /* no readme */
  }

  // Release
  const releaseCmd = versionArg
    ? `release view ${versionArg} --repo ${ghOrg}/${ghRepo} --json tagName,publishedAt,body,assets`
    : `release view --repo ${ghOrg}/${ghRepo} --json tagName,publishedAt,body,assets`;
  const release = ghJson(releaseCmd);
  const version = versionNormalize(release.tagName);

  // Assets → files
  const files = [];
  const unknownContains: string[] = [];
  const skippedAssets: string[] = [];
  const unconfirmedArchitectures: string[] = [];
  const ambiguousStandaloneBinaries: string[] = [];
  const cleanupPaths: string[] = [];
  for (const asset of release.assets as any[]) {
    if (NON_BINARY_ASSET_PATTERN.test(asset.name)) continue;

    let systems = inferSystems(asset.name);

    const archResult = inferArchitectures(asset.name);
    if (archResult.archs === null) {
      skippedAssets.push(`${asset.name} (unsupported architecture, e.g. RISC-V — no registry value exists)`);
      continue;
    }
    let architectures = archResult.archs;

    let contains = systems.length > 0 ? inferContainsFromFilename(asset.name, systems) : ([] as string[]);

    // Filename alone couldn't place the platform or the format, or couldn't confirm the
    // architecture of a Mac build (frequently a universal arm64+x64 binary with no filename
    // hint) — download and look inside the archive itself rather than guessing.
    const macArchUnconfirmed = !archResult.confident && systems.some(s => s.type === 'mac');
    const needsInspection =
      (systems.length === 0 || contains.length === 0 || macArchUnconfirmed) && INSPECTABLE_ASSET.test(asset.name);

    let sha256: string = asset.digest ? (asset.digest as string).replace('sha256:', '') : '';
    let size: number = asset.size;
    let tmpFile: string | null = null;
    if (!sha256 || needsInspection) {
      process.stdout.write(`  Downloading ${asset.name}... `);
      const res = await fetch(asset.url);
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${asset.url}`);
      const buffer = Buffer.from(await res.arrayBuffer());
      console.log('done');
      if (!sha256) sha256 = createHash('sha256').update(buffer).digest('hex');
      if (!size) size = buffer.length;
      if (needsInspection) {
        tmpFile = `/tmp/oas-fetch-asset-${Date.now()}-${path.basename(asset.name)}`;
        writeFileSync(tmpFile, buffer);
        cleanupPaths.push(tmpFile);
      }
    }

    let macArchFromInspection: string[] = [];
    let linuxArchFromInspection: string[] = [];
    let winArchFromInspection: string[] = [];
    if (tmpFile) {
      const extractedDir = extractArchive(tmpFile, asset.name);
      if (extractedDir) {
        cleanupPaths.push(extractedDir);
        const inspected = inspectExtractedDir(extractedDir);
        if (systems.length === 0 && inspected.platforms.size > 0) {
          systems = [...inspected.platforms].map(type => ({ type, ...inferVersionConstraint(asset.name, type) }));
        }
        if (contains.length === 0 && inspected.formats.size > 0) {
          const platform = systems[0]?.type;
          const vst2Value = platform === 'linux' ? 'so' : platform === 'win' ? 'dll' : 'vst';
          contains = [...inspected.formats].map(f => (f === '__vst2__' ? vst2Value : f));
        }
        macArchFromInspection = [...inspected.macArchitectures];
        linuxArchFromInspection = [...inspected.linuxArchitectures];
        winArchFromInspection = [...inspected.winArchitectures];
        if (inspected.standaloneCandidates.length > 0) {
          ambiguousStandaloneBinaries.push(
            `${asset.name}: ${inspected.standaloneCandidates.join(', ')} — could not tell which (if any) is the standalone app`,
          );
        }
      }
    }

    if (systems.length === 0) {
      // Likely a checksum file or source tarball — but could also be a real binary whose
      // platform not even archive inspection could place. Always surface it below rather
      // than dropping it silently.
      skippedAssets.push(`${asset.name} (no system/platform recognized, even after archive inspection)`);
      continue;
    }

    // Last resort: filename gave no format hint, and either the asset wasn't an extractable
    // archive (e.g. a .dmg/.exe installer) or inspection ran but still found nothing.
    if (contains.length === 0) contains = inferContainsFromText(release.body ?? '', readme, systems);

    if (macArchFromInspection.length > 0) {
      architectures = macArchFromInspection;
    } else if (linuxArchFromInspection.length > 0) {
      architectures = linuxArchFromInspection;
    } else if (winArchFromInspection.length > 0) {
      architectures = winArchFromInspection;
    } else if (!archResult.confident) {
      // Mac builds are frequently universal (arm64 + x64) with no architecture token in the
      // filename — don't silently assert x64, flag it for the reviewer to confirm. This isn't
      // mac-specific: a Windows/Linux sibling-build pair can be just as silent about it (seen on
      // pierreguillot/Camomile's "CamomileWindows32.zip" vs "...Windows64.zip" — "windows32"
      // never matches the "win32" filename pattern because of the extra "dows" in between, so
      // the genuinely 32-bit build defaulted to x64 with no warning at all before this covered
      // every platform, not just mac). Filename-blind hardware-targeted builds (MOD Devices'
      // MOD Duo/Duo X/Dwarf pedals — "modduo-new.zip" etc, no arch token at all, genuinely
      // 32-bit or 64-bit ARM) get caught here too when inspection couldn't run or found nothing.
      unconfirmedArchitectures.push(
        `${asset.name} (defaulted to x64 — verify manually, e.g. via 'file' on the binary inside)`,
      );
    }

    if (contains.length === 0) unknownContains.push(path.basename(asset.name));

    // Omit rather than write `attested: false` - most developers won't have this configured,
    // and there's no need to spell out the common case in every file entry.
    const attested = await checkAttestation(ghOrg, ghRepo, sha256);
    files.push({
      systems,
      architectures,
      contains,
      type: inferFileType(asset.name),
      size,
      sha256,
      ...(attested && { attested: true }),
      url: asset.url,
    });
  }
  for (const p of cleanupPaths) {
    try {
      execSync(`rm -rf "${p}"`, { stdio: 'pipe' });
    } catch {
      /* best-effort cleanup of /tmp scratch files */
    }
  }

  // Audio
  const audioLocalPath = `src/plugins/${pkgOrg}/${pkgRepo}/${pkgRepo}.flac`;
  const audioCdnUrl = `https://open-audio-stack.github.io/open-audio-stack-registry/plugins/${pkgOrg}/${pkgRepo}/${pkgRepo}.flac`;
  const audioSourceUrl = findAudioUrl(readme, ghOrg, ghRepo, branch);
  if (audioSourceUrl && !existsSync(audioLocalPath)) {
    process.stdout.write(`  Downloading audio... `);
    mkdirSync(path.dirname(audioLocalPath), { recursive: true });
    try {
      await downloadAndConvertAudio(audioSourceUrl, audioLocalPath);
      console.log(`saved to ${audioLocalPath}`);
    } catch (e: any) {
      console.log(`skipped (${e.message})`);
    }
  }

  // Image
  const imageLocalPath = `src/plugins/${pkgOrg}/${pkgRepo}/${pkgRepo}.jpg`;
  const imageCdnUrl = `https://open-audio-stack.github.io/open-audio-stack-registry/plugins/${pkgOrg}/${pkgRepo}/${pkgRepo}.jpg`;
  const imageSourceUrl = await findImageUrl(ghOrg, ghRepo, branch, readme);
  if (imageSourceUrl && !existsSync(imageLocalPath)) {
    process.stdout.write(`  Downloading image... `);
    mkdirSync(path.dirname(imageLocalPath), { recursive: true });
    try {
      await downloadAndConvertImage(imageSourceUrl, imageLocalPath);
      console.log(`saved to ${imageLocalPath}`);
    } catch (e: any) {
      console.log(`skipped (${e.message})`);
    }
  }

  // Changes — trim to 255 chars at a line boundary
  let changes = (release.body ?? '').trim();
  if (changes.length > 255) {
    const cut = changes.lastIndexOf('\n', 252);
    changes = (cut > 80 ? changes.slice(0, cut) : changes.slice(0, 252)) + '...';
  }
  // `changes` is a required field — many rolling/nightly releases publish an empty
  // body, which would otherwise fail schema validation on write.
  if (!changes) changes = `${release.tagName} release.`;

  // Build metadata object
  const pkg: Record<string, any> = {
    name: slugToTitleCase(ghRepo),
    author: ghUserDisplayName(ghOrg),
    description: (repoInfo.description ?? '').slice(0, 255),
    license,
    type: inferPluginType(repoInfo.description ?? '', topics, readme),
    tags: topics
      .filter(t => !TECHNICAL_TOPIC_RE.test(t))
      .slice(0, 8)
      .map(slugToTitleCase),
    url: `https://github.com/${ghOrg}/${ghRepo}`,
    ...(existsSync(audioLocalPath) ? { audio: audioCdnUrl } : {}),
    ...(existsSync(imageLocalPath) ? { image: imageCdnUrl } : {}),
    date: release.publishedAt,
    changes,
    files,
  };

  // Write index.yaml
  const yamlPath = `src/plugins/${pkgOrg}/${pkgRepo}/${version}/index.yaml`;
  if (existsSync(yamlPath)) {
    console.error(`\nError: ${yamlPath} already exists. Delete it first if you want to regenerate.`);
    process.exit(1);
  }
  mkdirSync(path.dirname(yamlPath), { recursive: true });
  const yamlContent = dumpYaml(pkg);
  writeFileSync(yamlPath, yamlContent);

  // Output
  console.log(`\nCreated: ${yamlPath}`);
  if (existsSync(imageLocalPath)) console.log(`Image:   ${imageLocalPath}`);
  console.log('\n─── Generated YAML (please review) ───\n');
  process.stdout.write(yamlContent);
  console.log('\n─── Fields requiring review ───');
  if (licenseDetectedFromText)
    console.log(
      `  license: "${license}"  — GitHub's API reported no license/"other"; detected from the LICENSE file's own text, verify`,
    );
  console.log(`  name:    "${pkg.name}"  — confirm display name matches plugin branding`);
  // The GitHub "About" field is often a tagline/pun rather than a real functional
  // description (e.g. Waxman's was "Let's rock, man!", merged as-is in PR #819 and flagged
  // by the plugin author in review) — flag short ones explicitly rather than relying on the
  // reviewer to notice, since a short description isn't visually distinct from a good one.
  const descLen = (pkg.description as string).length;
  console.log(
    `  description: "${pkg.description}"${descLen < 40 ? '  ⚠ very short — likely a tagline, expand from the README' : '  — confirm it explains what the plugin does, not just a tagline'}`,
  );
  console.log(`  type:    "${pkg.type}"  — confirm: instrument / effect / sampler / generator / tool`);
  const nonTitleCaseTags = (pkg.tags as string[]).filter(t => t !== slugToTitleCase(t));
  const tagsNote = nonTitleCaseTags.length
    ? `  ⚠ not Title Case: ${nonTitleCaseTags.join(', ')}`
    : '  — sourced from GitHub topics, adjust as needed';
  console.log(`  tags:    ${JSON.stringify(pkg.tags)}${tagsNote}`);
  console.log(`  changes: verify formatting and accuracy`);
  if (!existsSync(audioLocalPath)) console.log(`  audio:   not found — add manually if a demo is available`);
  if (!existsSync(imageLocalPath)) console.log(`  image:   not found — add manually if available`);
  const attestedCount = files.filter(f => f.attested).length;
  console.log(
    `  attested: ${attestedCount}/${files.length} file(s)${attestedCount === 0 ? ' — this developer has no GitHub Artifact Attestations configured, which is common and fine' : ''}`,
  );
  if (unknownContains.length > 0)
    console.log(`  contains: unknown format for: ${unknownContains.join(', ')} — add manually`);
  if (skippedAssets.length > 0) {
    console.log(
      `  ⚠ skipped ${skippedAssets.length} release asset(s) entirely — verify none of these are real binaries:`,
    );
    skippedAssets.forEach(a => console.log(`      - ${a}`));
  }
  if (unconfirmedArchitectures.length > 0) {
    console.log(`  ⚠ architectures unconfirmed for ${unconfirmedArchitectures.length} file(s) — verify manually:`);
    unconfirmedArchitectures.forEach(a => console.log(`      - ${a}`));
  }
  if (ambiguousStandaloneBinaries.length > 0) {
    console.log(`  ⚠ ambiguous standalone binaries — verify manually whether 'exe'/'elf' should be added:`);
    ambiguousStandaloneBinaries.forEach(a => console.log(`      - ${a}`));
  }
}

main().catch(e => {
  console.error('\nError:', e.message);
  process.exit(1);
});

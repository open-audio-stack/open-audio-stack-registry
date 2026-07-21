// Usage: tsx ./src/fetch.ts <github-url> [version-tag]
// Collects all deterministic metadata from a GitHub repo and writes a registry index.yaml.
// Review the printed output for: type, tags, changes, and any "contains" fields flagged as unknown.

import { createHash } from 'crypto';
import { execFileSync, execSync } from 'child_process';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
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

function slugToTitleCase(slug: string): string {
  return slug
    .replace(/([a-z])([A-Z])/g, '$1 $2') // camelCase → camel Case
    .split(/[-_\s]+/)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
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
  if (/mac(os)?[-_.]|[-_.]mac(os)?|darwin|\.dmg$|\.pkg$/.test(f) || tok('osx').test(f)) found.add('mac');
  // Distro names (ubuntu, debian, fedora) are common in CI-built asset names and carry
  // no literal "linux" substring — without this, those assets are silently dropped below.
  // "lin"/"lin64"/"lin32" is a shorthand some CI configs use in place of "linux".
  if (/linux[-_.]|[-_.]linux|ubuntu|debian|fedora|\.deb$|\.rpm$|\.appimage$/.test(f) || tok('lin(?:32|64)?').test(f))
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
  if (/x86[_-]64|amd64|64[-_]?bit/.test(f) || tok('x64').test(f)) return { archs: ['x64'], confident: true };
  if (/i[3-6]86|32[-_]?bit|win32/.test(f) || (tok('x86').test(f) && !/[-_]64/.test(f)) || tok('x32').test(f))
    return { archs: ['x32'], confident: true };
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
  if (tok('aax').test(f)) formats.push('aax');
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
  return /\.(exe|msi|dmg|pkg|deb|rpm|appimage)$/i.test(filename) ? 'installer' : 'archive';
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
const INSPECTABLE_ASSET = /\.(zip|tar\.gz|tgz|tar\.xz|tar\.bz2|pkg|dmg|deb|exe|msi)$/i;

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

function extractArchive(tmpFile: string, filename: string): string | null {
  const dir = `${tmpFile}-extracted`;
  try {
    if (/\.zip$/i.test(filename)) {
      mkdirSync(dir, { recursive: true });
      execSync(`unzip -oq "${tmpFile}" -d "${dir}"`, { stdio: 'pipe' });
      expandNestedPkgs(dir); // zip may wrap a .pkg rather than shipping raw bundles
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
  // Loose (not inside a plugin bundle) win .exe / linux ELF binaries that look like they
  // could be the standalone app entry point, but weren't unambiguous enough to auto-tag as
  // the 'exe'/'elf' format — surfaced to the reviewer rather than guessed.
  standaloneCandidates: string[];
}

// Installer-bundled helper binaries that are never the plugin's own standalone entry point —
// filtered out so they don't get misidentified as (or dilute confidence in) the real one.
const HELPER_BINARY_PATTERN = /unins|uninstall|vc_?redist|dotnetfx|dotnet-|winsparkle|crashpad|updater?\b|setup/i;

function inspectExtractedDir(dir: string): ArchiveInspection {
  const result: ArchiveInspection = {
    platforms: new Set(),
    formats: new Set(),
    macArchitectures: new Set(),
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
  const inBundle = (f: string) => /\.vst3\/|\.component\/|\.clap\/|\.lv2\//i.test(f);

  // Inspect real binaries for platform/architecture — `file` reads magic bytes, so this is
  // authoritative even when directory/file names give no hint at all.
  try {
    const candidates = execSync(
      `find "${dir}" -type f \\( -name "*.dylib" -o -name "*.so" -o -name "*.dll" -o -name "*.exe" -o -perm +111 \\)`,
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
        if (/\.exe$/i.test(f) && !inBundle(f) && !HELPER_BINARY_PATTERN.test(path.basename(f)))
          winStandaloneCandidates.push(path.relative(dir, f));
      } else if (/elf\s+\d+-bit/i.test(info)) {
        result.platforms.add('linux');
        // Linux CLAP/VST2 plugins are a single flat ELF file (unlike the directory bundles
        // used by vst3/component/lv2), so they'd otherwise slip past inBundle() and look like
        // a standalone candidate — exclude by extension instead.
        if (!inBundle(f) && !HELPER_BINARY_PATTERN.test(path.basename(f)) && !/\.(so|clap)$/i.test(f))
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

async function findImageUrl(org: string, repo: string, branch: string, readme: string): Promise<string | null> {
  const imageUrls = [
    ...[...readme.matchAll(/!\[[^\]]*\]\(([^)]+\.(?:png|jpe?g|gif|webp)[^)]*)\)/gi)].map(m => m[1]),
    ...[...readme.matchAll(/<img[^>]+src=["']([^"']+\.(?:png|jpe?g|gif|webp))/gi)].map(m => m[1]),
  ].filter(u => !/badge|shield|ko-?fi|travis|action|workflow|codecov/i.test(u));

  if (imageUrls.length > 0) {
    const url = imageUrls[0];
    if (/^https?:\/\//.test(url)) return url;
    return `https://raw.githubusercontent.com/${org}/${repo}/refs/heads/${branch}/${url.replace(/^\.\//, '')}`;
  }

  for (const dir of ['docs/img', 'docs', 'screenshots', 'assets', 'images', '.github']) {
    try {
      const contents: any[] = ghJson(`api repos/${org}/${repo}/contents/${dir}`);
      const imgs = contents.filter((f: any) => /\.(png|jpe?g)$/i.test(f.name) && f.download_url);
      if (imgs.length > 0) {
        const preferred = imgs.find((f: any) => /screenshot|preview|screen|plugin|ui/i.test(f.name));
        return (preferred ?? imgs[0]).download_url;
      }
    } catch {
      /* directory doesn't exist */
    }
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
    execSync(`ffmpeg -i "${tmp}" -vf "scale='min(1000,iw)':-1" -q:v 10 -update 1 "${destPath}" -y`, { stdio: 'pipe' });
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
  const license: string = repoInfo.licenseInfo?.key ?? '';
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
    } else if (!archResult.confident && systems.some(s => s.type === 'mac')) {
      // Mac builds are frequently universal (arm64 + x64) with no architecture token in the
      // filename — don't silently assert x64, flag it for the reviewer to confirm.
      unconfirmedArchitectures.push(`${asset.name} (defaulted to x64 — verify with 'file' on the binary inside)`);
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
    tags: topics.slice(0, 8).map(slugToTitleCase),
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
  console.log(`  name:    "${pkg.name}"  — confirm display name matches plugin branding`);
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

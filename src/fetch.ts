// Usage: tsx ./src/fetch.ts <github-url> [version-tag]
// Collects all deterministic metadata from a GitHub repo and writes a registry index.yaml.
// Review the printed output for: type, tags, changes, and any "contains" fields flagged as unknown.

import { createHash } from 'crypto';
import { execSync } from 'child_process';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import * as semver from 'semver';

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
const FILE_KEY_ORDER = ['systems', 'architectures', 'contains', 'format', 'type', 'size', 'sha256', 'url'];

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
    // (?!\d) at the end stops a date like "macOS-2024-07-28" from matching "20" as
    // if it were a truncated macOS version number.
    const m = f.match(/(?:macos|osx|mac)(?:[-_](?:universal|intel|arm64))?[-_](\d{1,2}(?:\.\d{1,2})?)(?!\d)/);
    if (m) return { min: parseFloat(m[1]) };
  }
  // Linux intentionally excluded: distro version tokens (ubuntu-20.04, fedora-38) reflect
  // the build environment's glibc floor, not a single "Linux OS version" a user can reason
  // about the same way — flagging this to a human is more honest than a fabricated number.
  return {};
}

function inferSystems(filename: string): Array<{ type: string; min?: number }> {
  const f = filename.toLowerCase();
  const found = new Set<string>();
  // Left-boundary guard is required: plain substring matching on "win" false-positives
  // inside product names like "airWINdows-..." and "clang-arm64-darWIN.dmg".
  if (/(?<![a-z])win(?:dows)?(?=[-_.]|$)|\.exe$|\.msi$/.test(f)) found.add('win');
  if (/mac(os)?[-_.]|[-_.]mac(os)?|\bosx\b|darwin|\.dmg$|\.pkg$/.test(f)) found.add('mac');
  // Distro names (ubuntu, debian, fedora) are common in CI-built asset names and carry
  // no literal "linux" substring — without this, those assets are silently dropped below.
  if (/linux[-_.]|[-_.]linux|ubuntu|debian|fedora|\.deb$|\.rpm$|\.appimage$/.test(f)) found.add('linux');
  return [...found].map(type => ({ type, ...inferVersionConstraint(filename, type) }));
}

// Returns null when the filename indicates an architecture with no corresponding
// registry value (e.g. RISC-V) — callers must skip the asset rather than guess.
function inferArchitectures(filename: string): string[] | null {
  const f = filename.toLowerCase();
  if (/riscv|risc-v/.test(f)) return null;
  if (/universal|fat/.test(f)) return ['arm64', 'x64'];
  if (/arm64ec/.test(f)) return ['arm64ec']; // check before the broader arm64 pattern below
  if (/arm64|aarch64|\barm\b|[-_]m[123][-_.]|apple[._-]?silicon/.test(f)) return ['arm64'];
  if (/armhf|armv7|arm32/.test(f)) return ['arm32'];
  if (/x86[_-]64|amd64|\bx64\b|64[-_]?bit/.test(f)) return ['x64'];
  if (/\bx86\b(?![-_]64)|i[3-6]86|\bx32\b|32[-_]?bit|win32/.test(f)) return ['x32'];
  return ['x64']; // safe default; flag for review if no hint found
}

// `systems` determines the correct per-platform VST2 enum value: the registry
// distinguishes vst (Mac), so (Linux), and dll (Windows) — there is no generic "vst2".
function inferContains(filename: string, systems: Array<{ type: string }>, releaseBody = '', readme = ''): string[] {
  const f = filename.toLowerCase();
  const formats: string[] = [];
  const platform = systems[0]?.type;
  const vst2Value = platform === 'linux' ? 'so' : platform === 'win' ? 'dll' : 'vst';

  if (/vst3/.test(f)) formats.push('vst3');
  if (/\bvst2\b/.test(f) || (/\bvst\b/.test(f) && !f.includes('vst3'))) formats.push(vst2Value);
  if (/\bau\b|\baudiounit\b/.test(f)) formats.push('component');
  if (/\bclap\b/.test(f)) formats.push('clap');
  if (/\blv2\b/.test(f)) formats.push('lv2');
  if (/\baax\b/.test(f)) formats.push('aax');

  // Fallback: scan release body then README when filename has no format indicators
  if (formats.length === 0) {
    const context = (releaseBody + ' ' + readme.slice(0, 5000)).toLowerCase();
    if (/\bvst3\b/.test(context)) formats.push('vst3');
    if (/\bvst2\b/.test(context) || (/\bvst\b/.test(context) && !formats.includes('vst3'))) formats.push(vst2Value);
    if (/\bclap\b/.test(context)) formats.push('clap');
    if (/\blv2\b/.test(context)) formats.push('lv2');
    if (/\baudio\s*unit\b/.test(context)) formats.push('component');
  }
  return formats;
}

function inferFileType(filename: string): string {
  return /\.(exe|msi|dmg|pkg|deb|rpm|appimage)$/i.test(filename) ? 'installer' : 'archive';
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

async function hashUrl(url: string): Promise<{ sha256: string; size: number }> {
  process.stdout.write(`  Hashing ${path.basename(url)}... `);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  console.log('done');
  return { sha256: createHash('sha256').update(buffer).digest('hex'), size: buffer.length };
}

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
  for (const asset of release.assets as any[]) {
    const systems = inferSystems(asset.name);
    if (systems.length === 0) {
      // Likely a checksum file or source tarball — but could also be a real binary
      // whose platform this script's regexes don't recognize. Always surface it below
      // rather than dropping it silently.
      skippedAssets.push(`${asset.name} (no system/platform recognized)`);
      continue;
    }

    const architectures = inferArchitectures(asset.name);
    if (architectures === null) {
      skippedAssets.push(`${asset.name} (unsupported architecture, e.g. RISC-V — no registry value exists)`);
      continue;
    }

    let sha256: string = asset.digest ? (asset.digest as string).replace('sha256:', '') : '';
    let size: number = asset.size;
    if (!sha256) {
      const hashed = await hashUrl(asset.url);
      sha256 = hashed.sha256;
      size = hashed.size;
    }

    const contains = inferContains(asset.name, systems, release.body ?? '', readme);
    if (contains.length === 0) unknownContains.push(path.basename(asset.name));

    files.push({
      systems,
      architectures,
      contains,
      type: inferFileType(asset.name),
      size,
      sha256,
      url: asset.url,
    });
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
  if (unknownContains.length > 0)
    console.log(`  contains: unknown format for: ${unknownContains.join(', ')} — add manually`);
  if (skippedAssets.length > 0) {
    console.log(
      `  ⚠ skipped ${skippedAssets.length} release asset(s) entirely — verify none of these are real binaries:`,
    );
    skippedAssets.forEach(a => console.log(`      - ${a}`));
  }
}

main().catch(e => {
  console.error('\nError:', e.message);
  process.exit(1);
});

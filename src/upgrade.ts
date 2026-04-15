import { dirCreate, dirRead, fileCreate, fileReadYaml } from '@open-audio-stack/core';
import yaml from 'js-yaml';
import path from 'path';
import { createHash } from 'crypto';
import * as semver from 'semver';

/**
 * Helper to compare versions
 * @param v1 First version
 * @param v2 Second version
 * @returns 1 if v2 > v1, -1 if v1 > v2, 0 if equal
 */
function versionCompare(v1: string, v2: string) {
  const v1parts = (semver.valid(v1) || semver.coerce(v1)?.version || v1.replace(/^v/, '')).split('.').map(Number);
  const v2parts = (semver.valid(v2) || semver.coerce(v2)?.version || v2.replace(/^v/, '')).split('.').map(Number);
  for (let i = 0; i < Math.max(v1parts.length, v2parts.length); ++i) {
    const p1 = v1parts[i] || 0;
    const p2 = v2parts[i] || 0;
    if (p2 > p1) return 1;
    if (p2 < p1) return -1;
  }
  return 0;
}

/**
 * Helper to normalize version strings to valid semver if possible
 * @param v Version string
 * @returns Valid semver or original
 */
function versionNormalize(v: string): string {
  const clean = v.replace(/^v/, '');
  return semver.valid(clean) || semver.coerce(clean)?.version || clean;
}

/**
 * Helper to calculate SHA256 of a remote file
 * @param url File URL
 * @returns SHA256 hash string
 */
async function fileHash(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
  const hash = createHash('sha256');
  const buffer = await response.arrayBuffer();
  hash.update(Buffer.from(buffer));
  return hash.digest('hex');
}

const yamlFiles = dirRead('src/**/*.yaml');
const pkgGroups: Record<string, string[]> = {};

if (!process.env.GITHUB_TOKEN) {
  console.warn('Warning: GITHUB_TOKEN is not set. You will likely hit rate limits.');
  console.warn('Set it with: export GITHUB_TOKEN=your_token\n');
}

// Group versions by package directory
for (const yamlFile of yamlFiles) {
  const dir = path.dirname(yamlFile);
  const pkgDir = path.dirname(dir);
  const version = path.basename(dir);
  if (!pkgGroups[pkgDir]) pkgGroups[pkgDir] = [];
  pkgGroups[pkgDir].push(version);
}

for (const pkgDir in pkgGroups) {
  const versions = pkgGroups[pkgDir].sort(versionCompare);
  const latestVersion = versions[versions.length - 1];
  const latestYamlFile = path.join(pkgDir, latestVersion, 'index.yaml');

  const pkgJson: any = fileReadYaml(latestYamlFile);
  if (!pkgJson || !pkgJson.url || !pkgJson.url.startsWith('https://github.com')) continue;

  const repo = pkgJson.url.replace('https://github.com/', '').replace(/\/$/, '').split('/').slice(0, 2).join('/');
  if (!repo || repo.includes(' ')) continue;

  try {
    let response;
    let retries = 2;
    while (retries >= 0) {
      response = await fetch(`https://api.github.com/repos/${repo}/releases`, {
        headers: {
          'User-Agent': 'open-audio-stack-registry-updater',
          ...(process.env.GITHUB_TOKEN ? { Authorization: `token ${process.env.GITHUB_TOKEN}` } : {}),
        },
      });

      if (response.status === 403 || response.status === 429) {
        const rateLimitReset = response.headers.get('x-ratelimit-reset');
        const retryAfter = response.headers.get('retry-after');
        let waitTime = 60000; // Default 1 minute
        if (rateLimitReset) {
          waitTime = Math.max(0, parseInt(rateLimitReset) * 1000 - Date.now()) + 1000;
        } else if (retryAfter) {
          waitTime = parseInt(retryAfter) * 1000;
        }

        console.warn(
          `Rate limit hit for ${repo}. Status: ${response.status}. Waiting ${Math.round(waitTime / 1000 / 60)}m ${Math.round((waitTime / 1000) % 60)}s...`,
        );
        await new Promise(resolve => setTimeout(resolve, waitTime));
        retries--;
        continue;
      }
      break;
    }

    if (!response || !response.ok) {
      if (response && response.status !== 404) {
        console.error(`Failed to fetch releases for ${repo}: ${response.status} ${response.statusText}`);
      }
      continue;
    }

    const releases: any[] = await response.json();
    if (!Array.isArray(releases)) continue;

    for (const release of releases) {
      if (release.draft || release.prerelease) continue;

      const newVersion = versionNormalize(release.tag_name);
      if (versionCompare(latestVersion, newVersion) > 0) {
        if (pkgGroups[pkgDir].includes(newVersion)) continue;

        const newVersionDir = path.join(pkgDir, newVersion);

        const newPkgJson = JSON.parse(JSON.stringify(pkgJson));
        newPkgJson.date = release.published_at;
        newPkgJson.changes = (release.body || release.name || '').substring(0, 255);

        // Update file URLs and metadata
        if (newPkgJson.files) {
          console.log(`Upgrading ${pkgDir} to ${newVersion}...`);
          for (const file of newPkgJson.files) {
            const oldUrl = file.url;
            const oldFilename = path.basename(oldUrl);

            // Try to find a matching asset in the new release
            const newAsset = release.assets.find((a: any) => {
              const potentialName = oldFilename
                .replace(latestVersion, newVersion)
                .replace('v' + latestVersion, release.tag_name);
              return a.name === potentialName || a.name === oldFilename;
            });

            if (newAsset) {
              file.url = newAsset.browser_download_url;
              file.size = newAsset.size;
              if (newAsset.digest) {
                file.sha256 = newAsset.digest.replace('sha256:', '');
              } else {
                console.log(`  Hashing ${file.url}...`);
                file.sha256 = await fileHash(file.url);
              }
            } else {
              // Fallback replacement in URL if no exact asset match found
              file.url = oldUrl.replace(latestVersion, newVersion).replace('v' + latestVersion, release.tag_name);
              console.log(`  Hashing ${file.url}...`);
              file.sha256 = await fileHash(file.url);
              // We can't know size easily without asset info, leave as is or recalculate if possible
              delete file.size; // Safety remove if size changed but we don't know it
            }
          }
        }

        dirCreate(newVersionDir);
        fileCreate(
          path.join(newVersionDir, 'index.yaml'),
          yaml.dump(newPkgJson, {
            lineWidth: -1,
            sortKeys: function (a, b) {
              const yamlOrder = [
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
              const filesOrder = ['systems', 'architectures', 'contains', 'format', 'type', 'size', 'sha256', 'url'];
              const isFile: boolean = filesOrder.includes(a) && filesOrder.includes(b);
              const aIndex: number = isFile ? filesOrder.indexOf(a) : yamlOrder.indexOf(a);
              const bIndex: number = isFile ? filesOrder.indexOf(b) : yamlOrder.indexOf(b);
              return bIndex < aIndex ? 1 : bIndex > aIndex ? -1 : 0;
            },
          }),
        );
        console.log(`./${path.join(newVersionDir, 'index.yaml')}`);

        // Update local list to avoid duplicates if multiple YAMLs exist (unlikely but safe)
        pkgGroups[pkgDir].push(newVersion);
        break;
      }
    }
  } catch (error) {
    console.error(`Error processing ${repo}:`, error);
  }

  // Delay to avoid aggressive calling
  const delay = process.env.GITHUB_TOKEN ? 200 : 1000;
  await new Promise(resolve => setTimeout(resolve, delay));
}

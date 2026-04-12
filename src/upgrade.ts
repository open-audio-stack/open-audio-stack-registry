import { dirCreate, dirRead, fileCreateYaml, fileReadYaml } from '@open-audio-stack/core';
import path from 'path';

/**
 * Helper to compare versions
 * @param v1 First version
 * @param v2 Second version
 * @returns 1 if v2 > v1, -1 if v1 > v2, 0 if equal
 */
function versionCompare(v1: string, v2: string) {
  const v1parts = v1.replace(/^v/, '').split('.').map(Number);
  const v2parts = v2.replace(/^v/, '').split('.').map(Number);
  for (let i = 0; i < Math.max(v1parts.length, v2parts.length); ++i) {
    const p1 = v1parts[i] || 0;
    const p2 = v2parts[i] || 0;
    if (p2 > p1) return 1;
    if (p2 < p1) return -1;
  }
  return 0;
}

const yamlFiles = dirRead('src/**/*.yaml');
const pkgGroups: Record<string, string[]> = {};

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
    const response = await fetch(`https://api.github.com/repos/${repo}/releases`, {
      headers: {
        'User-Agent': 'open-audio-stack-registry-updater',
        ...(process.env.GITHUB_TOKEN ? { Authorization: `token ${process.env.GITHUB_TOKEN}` } : {}),
      },
    });

    if (!response.ok) {
      if (response.status !== 404) {
        console.error(`Failed to fetch releases for ${repo}: ${response.status} ${response.statusText}`);
      }
      continue;
    }

    const releases: any[] = await response.json();
    if (!Array.isArray(releases)) continue;

    for (const release of releases) {
      if (release.draft || release.prerelease) continue;

      const newVersion = release.tag_name.replace(/^v/, '');
      if (versionCompare(latestVersion, newVersion) > 0) {
        if (pkgGroups[pkgDir].includes(newVersion)) continue;

        const newVersionDir = path.join(pkgDir, newVersion);

        const newPkgJson = JSON.parse(JSON.stringify(pkgJson));
        newPkgJson.date = release.published_at;
        newPkgJson.changes = (release.body || release.name || '').substring(0, 255);

        // Update file URLs
        if (newPkgJson.files) {
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
              // SHA256 is removed as it will be different for the new release
              delete file.sha256;
            } else {
              // Fallback replacement in URL if no exact asset match found
              file.url = oldUrl.replace(latestVersion, newVersion).replace('v' + latestVersion, release.tag_name);
              delete file.sha256;
              delete file.size;
            }
          }
        }

        dirCreate(newVersionDir);
        fileCreateYaml(path.join(newVersionDir, 'index.yaml'), newPkgJson);
        console.log(`./${path.join(newVersionDir, 'index.yaml')}`);

        // Update local list to avoid duplicates if multiple YAMLs exist (unlikely but safe)
        pkgGroups[pkgDir].push(newVersion);
      }
    }
  } catch (error) {
    console.error(`Error processing ${repo}:`, error);
  }

  // Small delay to avoid aggressive calling
  await new Promise(resolve => setTimeout(resolve, 100));
}

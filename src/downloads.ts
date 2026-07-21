// Enriches already-scanned registry packages with per-file download counts from the GitHub
// Releases API, then rolls those counts up to the version level (packageDownloadsTotal) and the
// package level (Package.getTotalDownloads, computed automatically in toJSON()).
//
// This is computed fresh at build time, not committed to the authored/PR-reviewed index.yaml
// files - same pattern as the `verified` field. Unlike `attested` (checked once at import time
// in fetch.ts, since a file's hash/url/release never change), download counts change
// continuously, so they need to be re-fetched on every build.
//
// Batched via GitHub's GraphQL API rather than one REST call per file/release: aliasing many
// repository+release lookups into a single request keeps this to roughly a dozen total requests
// for the whole registry instead of hundreds of individual calls. Calls the GraphQL endpoint
// directly (rather than shelling out to the gh CLI) since this runs as part of the registry
// build inside GitHub Actions, which can't assume any CLI beyond what's preinstalled - GITHUB_
// TOKEN (all this needs) is provided automatically there.

import { Package, packageDownloadsTotal, PackageVersion, RegistryLocal, RegistryType } from '@open-audio-stack/core';
import { getGithubToken } from './githubAuth.js';

const BATCH_SIZE = 40;
const GITHUB_RELEASE_ASSET_URL = /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/releases\/download\/([^/]+)\/([^/]+)$/;

interface ReleaseKey {
  org: string;
  repo: string;
  tag: string;
}

function releaseKeyId(key: ReleaseKey): string {
  return `${key.org}/${key.repo}@${key.tag}`;
}

// GraphQL string literals - GitHub org/repo/tag names can't legally contain these characters,
// but escape defensively rather than assume.
function graphqlString(value: string): string {
  return JSON.stringify(value);
}

function buildQuery(keys: ReleaseKey[]): string {
  const fields = keys
    .map(
      (key, index) => `
      r${index}: repository(owner: ${graphqlString(key.org)}, name: ${graphqlString(key.repo)}) {
        release(tagName: ${graphqlString(key.tag)}) {
          releaseAssets(first: 50) {
            nodes { name downloadCount }
          }
        }
      }`,
    )
    .join('\n');
  return `{${fields}\n}`;
}

// Runs one batched GraphQL request for up to BATCH_SIZE releases and returns a map of
// "org/repo@tag" -> Map<filename, downloadCount>. Best-effort: a failure for the whole batch
// (rate limit, network issue, missing token) is caught by the caller and simply means none of
// this batch's files get a `downloads` value this run, not a build failure.
async function fetchBatch(keys: ReleaseKey[]): Promise<Map<string, Map<string, number>>> {
  const results = new Map<string, Map<string, number>>();
  const query = buildQuery(keys);
  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${getGithubToken()}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) throw new Error(`GraphQL request failed: HTTP ${res.status}`);
  const body: any = await res.json();
  if (body.errors) throw new Error(`GraphQL errors: ${JSON.stringify(body.errors)}`);
  const data = body.data;
  keys.forEach((key, index) => {
    const releaseAssets = data?.[`r${index}`]?.release?.releaseAssets?.nodes;
    if (!Array.isArray(releaseAssets)) return;
    const assetMap = new Map<string, number>();
    releaseAssets.forEach((asset: { name: string; downloadCount: number }) => {
      assetMap.set(asset.name, asset.downloadCount);
    });
    results.set(releaseKeyId(key), assetMap);
  });
  return results;
}

export async function enrichDownloads(registry: RegistryLocal): Promise<void> {
  // Collect every file across every package/version, grouped by the release it belongs to, so
  // each unique release is queried once regardless of how many files/versions reference it.
  const releaseFiles = new Map<string, { key: ReleaseKey; files: Array<{ file: any; assetName: string }> }>();
  const versionsToRollUp: PackageVersion[] = [];
  const packages: Package[] = [];

  for (const type of Object.values(RegistryType)) {
    const manager = registry.getManager(type);
    if (!manager) continue;
    for (const pkg of manager.listPackages()) {
      packages.push(pkg);
      for (const [, pkgVersion] of pkg.versions) {
        versionsToRollUp.push(pkgVersion);
        for (const file of pkgVersion.files) {
          const match = GITHUB_RELEASE_ASSET_URL.exec(file.url);
          if (!match) continue; // not a GitHub release asset - no download count available
          const [, org, repo, tag, encodedName] = match;
          const key: ReleaseKey = { org, repo, tag: decodeURIComponent(tag) };
          const id = releaseKeyId(key);
          if (!releaseFiles.has(id)) releaseFiles.set(id, { key, files: [] });
          releaseFiles.get(id)!.files.push({ file, assetName: decodeURIComponent(encodedName) });
        }
      }
    }
  }

  const uniqueKeys = Array.from(releaseFiles.values()).map(entry => entry.key);
  const assetsByRelease = new Map<string, Map<string, number>>();
  for (let i = 0; i < uniqueKeys.length; i += BATCH_SIZE) {
    const batch = uniqueKeys.slice(i, i + BATCH_SIZE);
    try {
      const batchResults = await fetchBatch(batch);
      for (const [id, assetMap] of batchResults) assetsByRelease.set(id, assetMap);
    } catch (err: any) {
      // Best-effort: log and move on to the next batch rather than failing the whole build.
      console.warn(`Failed to fetch download counts for a batch of ${batch.length} release(s): ${err.message}`);
    }
  }

  // Apply fetched counts back onto each file. Only set the field when > 0 - omitting it for
  // "not fetched" and "genuinely zero downloads" alike keeps the generated JSON smaller, and
  // neither case is worth distinguishing for a popularity signal.
  for (const [id, entry] of releaseFiles) {
    const assetMap = assetsByRelease.get(id);
    if (!assetMap) continue;
    for (const { file, assetName } of entry.files) {
      const downloads = assetMap.get(assetName);
      if (downloads) file.downloads = downloads;
    }
  }

  // Roll up files -> version, same omit-when-zero treatment. Package-level rollup happens
  // automatically in Package.toJSON() via getTotalDownloads(), which reads these values.
  for (const pkgVersion of versionsToRollUp) {
    const total = packageDownloadsTotal(pkgVersion);
    if (total > 0) pkgVersion.downloads = total;
  }

  const totalReleases = uniqueKeys.length;
  const fetchedReleases = assetsByRelease.size;
  console.log(`Downloads: fetched ${fetchedReleases}/${totalReleases} release(s) across ${packages.length} package(s)`);
}

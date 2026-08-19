import path from 'path';
import { fileCreateJson, fileExists, fileReadJson, RegistryType } from '@open-audio-stack/core';

// Fields dropped from each file entry at the summary tier - the only fields not needed until a
// client actually installs a package (which always goes through the org/package/version
// endpoints, where these are still present). Everything else - architectures, systems, contains,
// type, size, downloads, attested - stays, so filtering/sorting on the summary stays fully
// correct (see specification.md "Listing endpoints vs package endpoints").
const FILE_DOWNLOAD_ONLY_FIELDS = ['url', 'sha256'];

// Recursively, in place: for every package node (identified by having both a `version` string
// and a `versions` map, per Package.toJSON()) drop every version except the latest, and drop
// FILE_DOWNLOAD_ONLY_FIELDS from each entry of whatever `files` arrays remain.
function trimSummaryPackage(node: unknown): void {
  if (Array.isArray(node)) {
    node.forEach(trimSummaryPackage);
    return;
  }
  if (!node || typeof node !== 'object') return;
  const record = node as Record<string, unknown>;
  if (typeof record.version === 'string' && record.versions && typeof record.versions === 'object') {
    const versions = record.versions as Record<string, unknown>;
    for (const versionNum of Object.keys(versions)) {
      if (versionNum !== record.version) delete versions[versionNum];
    }
  }
  if (Array.isArray(record.files)) {
    record.files.forEach((file: unknown) => {
      if (!file || typeof file !== 'object') return;
      FILE_DOWNLOAD_ONLY_FIELDS.forEach(field => delete (file as Record<string, unknown>)[field]);
    });
  }
  for (const value of Object.values(record)) {
    trimSummaryPackage(value);
  }
}

// The top-level and per-type index files list every package/version in one flat document, so
// they're the ones worth trimming for size: only the latest version's metadata is kept, and each
// of its files has FILE_DOWNLOAD_ONLY_FIELDS dropped. Org, package, and version-level index files
// (e.g. out/plugins/<org>/index.json) are left untouched - those are what a client fetches once
// it wants the full version history and download url/sha256 for a specific package.
export function stripSummaryFiles(dir: string): void {
  const summaryPaths = [
    path.join(dir, 'index.json'),
    ...Object.values(RegistryType).map(type => path.join(dir, type, 'index.json')),
  ];
  for (const summaryPath of summaryPaths) {
    // Not every registry.export() call registers all four managers (e.g. a partial build, or a
    // test that only cares about one type) - skip whichever summary files weren't produced.
    if (!fileExists(summaryPath)) continue;
    const data = fileReadJson(summaryPath);
    trimSummaryPackage(data);
    fileCreateJson(summaryPath, data);
  }
}

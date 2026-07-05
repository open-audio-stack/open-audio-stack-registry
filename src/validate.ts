import {
  apiBuffer,
  dirCreate,
  fileCreate,
  fileExists,
  fileReadYaml,
  fileValidateMetadata,
  Package,
  PackageVersion,
  pathGetSlug,
  pathGetVersion,
  PluginFile,
  PresetFile,
  ProjectFile,
} from '@open-audio-stack/core';
import path from 'path';
import { ZodIssue } from 'zod';

const filePath: string = process.argv[2];
const subPath: string = filePath.split(path.sep).slice(2).join(path.sep);
// const type: string = filePath.split(path.sep).slice(1, 2).join(path.sep);
const slug: string = pathGetSlug(subPath, path.sep);
const version: string = pathGetVersion(subPath, path.sep);

// Validate metadata
const pkgJson = fileReadYaml(filePath) as PackageVersion;
const pkg = new Package(slug);
pkg.addVersion(version, pkgJson);
pkg.logEnable();
pkg.outputReport();

let hasErrors = false;

// Loop through files in yaml file
for (const type in pkgJson.files) {
  const file: PluginFile | PresetFile | ProjectFile = pkgJson.files[type];
  const fileName: string = path.basename(file.url);
  const fileLocalPath: string = path.join('test', 'downloads', slug, version, fileName);

  // Reject mutable GitHub branch/tag archive URLs — they change sha256 on every commit
  const mutableArchivePattern = /github\.com\/[^/]+\/[^/]+\/archive\/refs\/(heads|tags)\//;
  if (mutableArchivePattern.test(file.url)) {
    hasErrors = true;
    const suggestedUrl = file.url.replace(/\/archive\/refs\/(heads|tags)\/[^/]+\.zip$/, '/archive/<commit-sha>.zip');
    pkg.logErrors([
      {
        message: `url points to a mutable branch archive, pin to a specific commit instead: ${suggestedUrl}`,
        path: ['url'],
      },
    ] as ZodIssue[]);
  }

  // Download file if it doesn't already exist
  // Downloads directory is scanned for viruses in the next GitHub Action
  if (!fileExists(fileLocalPath)) {
    try {
      const fileArrayBuffer: ArrayBuffer = await apiBuffer(file.url);
      const fileBuffer: Buffer = Buffer.from(fileArrayBuffer);
      dirCreate(path.dirname(fileLocalPath));
      fileCreate(fileLocalPath, fileBuffer);
    } catch (err) {
      hasErrors = true;
      const message = err instanceof Error ? err.message : String(err);
      pkg.logErrors([{ message: `Failed to download file: ${message}`, path: ['url'] }] as ZodIssue[]);
      continue;
    }
  }

  // Validate file vs package metadata and output errors
  const errorsFile = await fileValidateMetadata(fileLocalPath, file);
  if (errorsFile.length > 0) hasErrors = true;
  pkg.logErrors(errorsFile);
}

// Ensure image and audio files exist locally in registry
const audioPathLocal = pkgJson.audio?.replace('https://open-audio-stack.github.io/open-audio-stack-registry/', 'src/');
if (audioPathLocal && !fileExists(audioPathLocal)) {
  hasErrors = true;
  pkg.logErrors([
    {
      message: 'File does not exist locally',
      path: [audioPathLocal],
    },
  ] as ZodIssue[]);
}
const imagePathLocal: string = pkgJson.image.replace(
  'https://open-audio-stack.github.io/open-audio-stack-registry/',
  'src/',
);
if (!fileExists(imagePathLocal)) {
  hasErrors = true;
  pkg.logErrors([
    {
      message: 'File does not exist locally',
      path: [imagePathLocal],
    },
  ] as ZodIssue[]);
}

if (hasErrors) process.exit(1);

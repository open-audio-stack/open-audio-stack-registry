import {
  apiBuffer,
  dirCreate,
  dirExists,
  fileCreate,
  fileExists,
  fileReadYaml,
  fileValidateMetadata,
  logReport,
  packageRecommendations,
  packageValidate,
  PackageValidationError,
  PackageValidationRec,
  pathGetExt,
  pathGetSlug,
  pathGetVersion,
  PluginFile,
  PluginInterface,
  PresetFile,
  ProjectFile,
} from '@open-audio-stack/core';
import path from 'path';

const DIR_DOWNLOADS: string = 'downloads';
const filePath: string = process.argv[2];
const ext: string = pathGetExt(filePath);
if (ext !== 'yaml') throw new Error(`${ext} not supported | ${filePath}`);

// Ensure directory and log file exist
if (!dirExists(DIR_DOWNLOADS)) dirCreate(DIR_DOWNLOADS);

// Validate the schema and fields
const subPath: string = filePath.replace('src/plugins/', '').replace('src/presets/', '').replace('src/projects/', '');
const pkgSlug: string = pathGetSlug(subPath);
const pkgVersion: string = pathGetVersion(subPath);
const pkgFile: PluginInterface = fileReadYaml(filePath) as PluginInterface;

// Package metadata validation
const errors: PackageValidationError[] = packageValidate(pkgFile);
const recs: PackageValidationRec[] = packageRecommendations(pkgFile);
logReport(`${pkgSlug} | ${pkgVersion} | ${filePath}`, errors, recs);

// Loop through files in yaml file
for (const type in pkgFile.files) {
  const file: PluginFile | PresetFile | ProjectFile = pkgFile.files[type];
  const fileName: string = path.basename(file.url);
  const fileLocalPath: string = path.join(DIR_DOWNLOADS, fileName);

  // Download file if it doesn't already exist
  // Downloads directory is scanned for viruses in the next GitHub Action
  if (!fileExists(fileLocalPath)) {
    const fileArrayBuffer: ArrayBuffer = await apiBuffer(file.url);
    const fileBuffer: Buffer = Buffer.from(fileArrayBuffer);
    fileCreate(fileLocalPath, fileBuffer);
  }

  // Validate file vs package metadata and output errors
  const errorsFile: PackageValidationError[] = fileValidateMetadata(fileLocalPath, file);
  logReport(`${pkgSlug} | ${pkgVersion} | ${fileLocalPath}`, errorsFile);
}

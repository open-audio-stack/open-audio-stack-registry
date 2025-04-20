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
const type: string = filePath.split(path.sep).slice(1, 2).join(path.sep);
const slug: string = pathGetSlug(subPath, path.sep);
const version: string = pathGetVersion(subPath, path.sep);

console.log('-------- Params --------');
console.log('filePath', filePath);
console.log('subPath', subPath);
console.log('type', type);
console.log('slug', slug);
console.log('version', version);

const pkgJson = fileReadYaml(filePath) as PackageVersion;
const pkg = new Package(slug);
pkg.logEnable();
pkg.addVersion(version, pkgJson);

console.log('-------- Input --------');
console.log(pkgJson);

console.log('-------- Output --------');
console.log(pkg.toJSON());

console.log('-------- Files --------');
// Loop through files in yaml file
for (const type in pkgJson.files) {
  const file: PluginFile | PresetFile | ProjectFile = pkgJson.files[type];
  const fileName: string = path.basename(file.url);
  const fileLocalPath: string = path.join('test', 'downloads', slug, version, fileName);

  // Download file if it doesn't already exist
  // Downloads directory is scanned for viruses in the next GitHub Action
  if (!fileExists(fileLocalPath)) {
    const fileArrayBuffer: ArrayBuffer = await apiBuffer(file.url);
    const fileBuffer: Buffer = Buffer.from(fileArrayBuffer);
    dirCreate(path.dirname(fileLocalPath));
    fileCreate(fileLocalPath, fileBuffer);
  }

  // Validate file vs package metadata and output errors
  const errorsFile = await fileValidateMetadata(fileLocalPath, file);
  pkg.logErrors(errorsFile);
}

// Ensure image and audio files exist locally in registry
const audioPathLocal: string = pkgJson.audio.replace(
  'https://open-audio-stack.github.io/open-audio-stack-registry/',
  'src/',
);
console.log('⎋', audioPathLocal);
if (!fileExists(audioPathLocal)) {
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
console.log('⎋', imagePathLocal);
if (!fileExists(imagePathLocal)) {
  pkg.logErrors([
    {
      message: 'File does not exist locally',
      path: [imagePathLocal],
    },
  ] as ZodIssue[]);
}

console.log('-------- Report --------');
console.log(JSON.stringify(pkg.getReport(), null, 2));

// Test a real installation on this operating system
// console.log('-------- Install --------');
// const managerConfig: ConfigInterface = {
//   appDir: 'test',
//   pluginsDir: 'test/plugins',
//   presetsDir: 'test/presets',
//   projectsDir: 'test/projects',
// };
// const manager: ManagerLocal = new ManagerLocal(type as RegistryType, managerConfig);
// manager.logEnable();
// manager.addPackage(pkg);
// manager.install(slug, version);

import {
  dirCreate,
  dirRead,
  fileJsonCreate,
  fileReadYaml,
  pathGetSlug,
  pathGetVersion,
  Config,
  packageRecommendations,
  PluginInterface,
  Registry,
  RegistryType,
  PackageValidationRec,
  PresetInterface,
  ProjectInterface,
  PackageVersionValidator,
} from '@open-audio-stack/core';
import { getReport, updateReport } from './report.js';

const config: Config = new Config();
const registry: Registry = new Registry();

export function generateConfig(dirRoot: string, items: any) {
  items.forEach((item: any) => {
    const dirItem: string = `${dirRoot}/${item.value}`;
    dirCreate(dirItem);
    fileJsonCreate(`${dirItem}/index.json`, item);
  });
  fileJsonCreate(`${dirRoot}/index.json`, items);
}

export function generateYaml(pathIn: string, pathOut: string, pathType: string, type: RegistryType) {
  const packagesByOrg: any = {};
  const filePaths: string[] = dirRead(`${pathIn}/${pathType}/**/*.yaml`);
  filePaths.forEach((filePath: string) => {
    const subPath: string = filePath.replace(`${pathIn}/${pathType}/`, '');
    const pkgSlug: string = pathGetSlug(subPath);
    const pkgVersion: string = pathGetVersion(subPath);
    const pkgFile = fileReadYaml(filePath) as PluginInterface | PresetInterface | ProjectInterface;

    const errors = PackageVersionValidator.safeParse(pkgFile).error?.issues;
    const recs: PackageValidationRec[] = packageRecommendations(pkgFile);
    updateReport(pkgSlug, pkgVersion, filePath, errors, recs);
    registry.packageVersionAdd(type, pkgSlug, pkgVersion, pkgFile);

    dirCreate(`${pathOut}/${pathType}/${pkgSlug}/${pkgVersion}`);
    fileJsonCreate(`${pathOut}/${pathType}/${pkgSlug}/${pkgVersion}/index.json`, pkgFile);
    fileJsonCreate(`${pathOut}/${pathType}/${pkgSlug}/index.json`, registry.package(type, pkgSlug));

    const pkgOrg: string = pkgSlug.split('/')[0];
    if (!packagesByOrg[pkgOrg]) packagesByOrg[pkgOrg] = {};
    packagesByOrg[pkgOrg][pkgSlug] = registry.package(type, pkgSlug);
  });
  for (const orgId in packagesByOrg) {
    dirCreate(`${pathOut}/${pathType}/${orgId}`);
    fileJsonCreate(`${pathOut}/${pathType}/${orgId}/index.json`, packagesByOrg[orgId]);
  }
  dirCreate(`${pathOut}/${pathType}`);
  fileJsonCreate(`${pathOut}/${pathType}/index.json`, registry.packages(type));
}

generateConfig('out/config/architectures', config.architectures());
generateConfig('out/config/file-formats/', config.fileFormats());
generateConfig('out/config/file-types', config.fileTypes());
generateConfig('out/config/licenses', config.licenses());
generateConfig('out/config/plugin-formats', config.pluginFormats());
generateConfig('out/config/plugin-types', config.pluginTypes());
generateConfig('out/config/preset-formats', config.presetFormats());
generateConfig('out/config/preset-types', config.presetTypes());
generateConfig('out/config/project-formats', config.projectFormats());
generateConfig('out/config/project-types', config.projectTypes());
generateConfig('out/config/systems', config.systems());

generateYaml('src', 'out', 'plugins', RegistryType.Plugins);
generateYaml('src', 'out', 'presets', RegistryType.Presets);
generateYaml('src', 'out', 'projects', RegistryType.Projects);

fileJsonCreate('out/index.json', registry.get());
fileJsonCreate('out/report.json', getReport());

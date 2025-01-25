import {
  dirCreate,
  dirRead,
  fileCreateJson,
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
  Package,
  Manager,
} from '@open-audio-stack/core';
import { getReport, updateReport } from './report.js';

const config: Config = new Config();
const registry: Registry = new Registry(
  'Open Audio Registry',
  'https://open-audio-stack.github.io/open-audio-stack-registry',
  '1.0.0',
);

export function generateConfig(dirRoot: string, items: any) {
  items.forEach((item: any) => {
    const dirItem: string = `${dirRoot}/${item.value}`;
    dirCreate(dirItem);
    fileCreateJson(`${dirItem}/index.json`, item);
  });
  fileCreateJson(`${dirRoot}/index.json`, items);
}

export function generateYaml(pathIn: string, pathOut: string, type: RegistryType) {
  const manager = new Manager(type);
  registry.addManager(manager);
  const packagesByOrg: any = {};
  const filePaths: string[] = dirRead(`${pathIn}/${type}/**/*.yaml`);
  filePaths.forEach((filePath: string) => {
    const subPath: string = filePath.replace(`${pathIn}/${type}/`, '');
    const pkgSlug: string = pathGetSlug(subPath);
    const pkgVersion: string = pathGetVersion(subPath);
    const pkgFile = fileReadYaml(filePath) as PluginInterface | PresetInterface | ProjectInterface;

    const errors = PackageVersionValidator.safeParse(pkgFile).error?.issues;
    const recs: PackageValidationRec[] = packageRecommendations(pkgFile);
    updateReport(pkgSlug, pkgVersion, filePath, errors, recs);

    const pkg = new Package(pkgSlug);
    pkg.addVersion(pkgVersion, pkgFile);
    manager.addPackage(pkg);

    dirCreate(`${pathOut}/${type}/${pkgSlug}/${pkgVersion}`);
    fileCreateJson(`${pathOut}/${type}/${pkgSlug}/${pkgVersion}/index.json`, pkgFile);
    fileCreateJson(`${pathOut}/${type}/${pkgSlug}/index.json`, pkg.toJSON());

    const pkgOrg: string = pkgSlug.split('/')[0];
    if (!packagesByOrg[pkgOrg]) packagesByOrg[pkgOrg] = {};
    packagesByOrg[pkgOrg][pkgSlug] = pkg.toJSON();
  });
  for (const orgId in packagesByOrg) {
    dirCreate(`${pathOut}/${type}/${orgId}`);
    fileCreateJson(`${pathOut}/${type}/${orgId}/index.json`, packagesByOrg[orgId]);
  }
  dirCreate(`${pathOut}/${type}`);
  fileCreateJson(`${pathOut}/${type}/index.json`, manager.toJSON());
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

generateYaml('src', 'out', RegistryType.Plugins);
generateYaml('src', 'out', RegistryType.Presets);
generateYaml('src', 'out', RegistryType.Projects);

fileCreateJson('out/index.json', registry.toJSON());
fileCreateJson('out/report.json', getReport());

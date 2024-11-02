import chalk from 'chalk';
import path from 'path';
import { Config, FileSystem, PackageValidationError, PluginInterface, Registry } from '@open-audio-stack/core';

const config: Config = new Config({});
const fileSystem: FileSystem = new FileSystem();
const registry: Registry = new Registry({
  name: 'Open Audio Registry',
  packages: {},
  url: 'https://open-audio-stack.github.io/open-audio-stack-registry',
  version: '1.0.0',
});

export function generateConfig(dirRoot: string, items: any) {
  items.forEach((item: any) => {
    const dirItem: string = `${dirRoot}/${item.value}`;
    fileSystem.dirCreate(dirItem);
    fileSystem.fileJsonCreate(`${dirItem}/index.json`, item);
  });
  fileSystem.fileJsonCreate(`${dirRoot}/index.json`, items);
}

export function generateRegistry(dirRoot: string, glob: string, ext: string, dirOut: string) {
  console.log('-- Yaml plugins --');
  const filePaths: string[] = fileSystem.dirRead(dirRoot + glob + ext);
  filePaths.forEach((filePath: string) => {
    // TODO make this code reusable and better.
    const parts: string[] = path.dirname(filePath).replace(dirRoot, '').replace(ext, '').split(path.sep);
    const pkgSlug: string = `${parts[0]}/${parts[1]}`;
    const pkgVersion: string = parts[2];
    const pkgFile: PluginInterface = fileSystem.fileReadYaml(filePath) as PluginInterface;
    const errors: PackageValidationError[] = registry.packageVersionValidate(pkgFile);
    if (errors.length > 0) {
      console.log(chalk.red(`X ${pkgSlug} | ${pkgVersion} | ${filePath}`));
      console.log(chalk.red(errors));
      // console.log(compatibility ? chalk.red(errors) + chalk.yellow(compatibility) : chalk.red(errors));
    } else {
      console.log(chalk.green(`✓ ${pkgSlug} | ${pkgVersion} | ${filePath}`));
      // if (compatibility) console.log(chalk.yellow(compatibility));
    }
    registry.packageVersionAdd(pkgSlug, pkgVersion, pkgFile);
    fileSystem.dirCreate(path.dirname(filePath).replace(dirRoot, dirOut));
    fileSystem.fileJsonCreate(filePath.replace(dirRoot, dirOut).replace(ext, '.json'), pkgFile);
  });
  fileSystem.fileJsonCreate('./out/index.json', registry.get());
  console.log(`-- ${Object.keys(registry.packages()).length} Yaml plugins added --`);
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
generateRegistry('src/plugins/', '**/*', '.yaml', 'out/plugins/');

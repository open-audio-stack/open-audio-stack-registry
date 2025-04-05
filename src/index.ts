import { ConfigInterface, ConfigLocal, RegistryLocal, RegistryType, ManagerLocal } from '@open-audio-stack/core';

const managerConfig: ConfigInterface = {
  appDir: 'src',
  pluginsDir: 'src/plugins',
  presetsDir: 'src/presets',
  projectsDir: 'src/projects',
};

const registry: RegistryLocal = new RegistryLocal(
  'Open Audio Registry',
  'https://open-audio-stack.github.io/open-audio-stack-registry',
  '1.0.0',
);

const managerPlugins: ManagerLocal = new ManagerLocal(RegistryType.Plugins, managerConfig);
registry.addManager(managerPlugins);

const managerPresets: ManagerLocal = new ManagerLocal(RegistryType.Presets, managerConfig);
registry.addManager(managerPresets);

const managerProjects: ManagerLocal = new ManagerLocal(RegistryType.Projects, managerConfig);
registry.addManager(managerProjects);

registry.scan('yaml', false);
registry.export('out');

const config: ConfigLocal = new ConfigLocal('src/config.json');
config.export('out/config');

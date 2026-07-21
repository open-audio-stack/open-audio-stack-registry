import { ConfigInterface, ConfigLocal, RegistryLocal, RegistryType, ManagerLocal } from '@open-audio-stack/core';
import { enrichDownloads } from './downloads.js';

const managerConfig: ConfigInterface = {
  appDir: 'src',
  appsDir: 'src/apps',
  pluginsDir: 'src/plugins',
  presetsDir: 'src/presets',
  projectsDir: 'src/projects',
};

const registry: RegistryLocal = new RegistryLocal(
  'Open Audio Registry',
  'https://open-audio-stack.github.io/open-audio-stack-registry',
  '1.0.0',
);
registry.logEnable();

const managerApps: ManagerLocal = new ManagerLocal(RegistryType.Apps, managerConfig);
managerApps.logEnable();
registry.addManager(managerApps);

const managerPlugins: ManagerLocal = new ManagerLocal(RegistryType.Plugins, managerConfig);
managerPlugins.logEnable();
registry.addManager(managerPlugins);

const managerPresets: ManagerLocal = new ManagerLocal(RegistryType.Presets, managerConfig);
managerPresets.logEnable();
registry.addManager(managerPresets);

const managerProjects: ManagerLocal = new ManagerLocal(RegistryType.Projects, managerConfig);
managerProjects.logEnable();
registry.addManager(managerProjects);

registry.scan('yaml', false);
try {
  await enrichDownloads(registry);
} catch (err: any) {
  // Best-effort enrichment - a failure here (e.g. gh not installed/authenticated, or a rate
  // limit) shouldn't block the rest of the registry from building.
  console.warn(`Skipping download-count enrichment: ${err.message}`);
}
registry.export('out');

const config: ConfigLocal = new ConfigLocal(managerConfig);
config.logEnable();
config.export('out/config');

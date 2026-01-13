import { expect, test } from 'vitest';
import {
  ConfigInterface,
  ManagerLocal,
  PluginInterface,
  RegistryLocal,
  RegistryInterface,
  RegistryType,
  Architecture,
  PluginFormat,
  SystemType,
  FileType,
  License,
  PluginType,
  PackageInterface,
  fileReadJson,
} from '@open-audio-stack/core';
import path from 'path';

const CONFIG: ConfigInterface = {
  appDir: 'src',
  pluginsDir: 'src/plugins',
  presetsDir: 'src/presets',
  projectsDir: 'src/projects',
};

const slug: string = 'surge-synthesizer/surge';
const version: string = '1.3.1';

export const PLUGIN: PluginInterface = {
  audio: 'https://open-audio-stack.github.io/open-audio-stack-registry/plugins/surge-synthesizer/surge/surge.flac',
  author: 'Surge Synth Team',
  changes: '- Fixed bug with audio\n- New feature added\n',
  date: '2024-03-02T00:00:00.000Z',
  description:
    'Hybrid synthesizer featuring many synthesis techniques, a great selection of filters, a flexible modulation engine, a smorgasbord of effects, and modern features like MPE and microtuning.',
  files: [
    {
      architectures: [Architecture.X64],
      contains: [
        PluginFormat.LinuxStandalone,
        PluginFormat.CleverAudioPlugin,
        PluginFormat.LADSPAVersion2,
        PluginFormat.VST3,
      ],
      sha256: '729d92b5a4288f4c22587b8e84244c26aef34e58312ab5b4f4d1f196699b802e',
      systems: [{ type: SystemType.Linux }],
      size: 220693484,
      type: FileType.Installer,
      url: 'https://github.com/surge-synthesizer/releases-xt/releases/download/1.3.1/surge-xt-linux-x64-1.3.1.deb',
    },
    {
      architectures: [Architecture.X64],
      contains: [
        PluginFormat.LinuxStandalone,
        PluginFormat.CleverAudioPlugin,
        PluginFormat.LADSPAVersion2,
        PluginFormat.VST3,
      ],
      sha256: '135e9b8d3e71ab4dd502eee464b99f82c733be2ae23e8fca3724773dee3d54e8',
      systems: [{ type: SystemType.Linux }],
      size: 346260010,
      type: FileType.Installer,
      url: 'https://github.com/surge-synthesizer/releases-xt/releases/download/1.3.1/surge-xt-x86_64-1.3.1.rpm',
    },
    {
      architectures: [Architecture.Arm64, Architecture.X64],
      contains: [
        PluginFormat.MacStandalone,
        PluginFormat.CleverAudioPlugin,
        PluginFormat.AudioUnits,
        PluginFormat.VST3,
      ],
      sha256: 'e30b218700d4067edb3a0eadb4128784e41f91f663cff19e3fbb38460883cf59',
      systems: [{ type: SystemType.Mac }],
      size: 411860016,
      type: FileType.Installer,
      url: 'https://github.com/surge-synthesizer/releases-xt/releases/download/1.3.1/surge-xt-macOS-1.3.1.dmg',
    },
    {
      architectures: [Architecture.X32],
      contains: [PluginFormat.WinStandalone, PluginFormat.VST3],
      sha256: '3d766adb0d04b86f7aca8c136bc4c7b0727d316ec10895f679f1c01b0c236a00',
      systems: [{ type: SystemType.Win }],
      size: 180270273,
      type: FileType.Installer,
      url: 'https://github.com/surge-synthesizer/releases-xt/releases/download/1.3.1/surge-xt-win32-1.3.1-setup.exe',
    },
    {
      architectures: [Architecture.X64],
      contains: [PluginFormat.WinStandalone, PluginFormat.CleverAudioPlugin, PluginFormat.VST3],
      sha256: '2bac9c87c3e4293ecc4110087f5bb90a5218427921613409b84673f513f02bd3',
      systems: [{ type: SystemType.Win }],
      size: 182890274,
      type: FileType.Installer,
      url: 'https://github.com/surge-synthesizer/releases-xt/releases/download/1.3.1/surge-xt-win64-1.3.1-setup.exe',
    },
  ],
  image: 'https://open-audio-stack.github.io/open-audio-stack-registry/plugins/surge-synthesizer/surge/surge.jpg',
  license: License.GNUGeneralPublicLicensev3,
  name: 'Surge XT',
  tags: ['Instrument', 'Synth', 'Modulation'],
  type: PluginType.Instrument,
  url: 'https://github.com/surge-synthesizer/surge',
  verified: true,
};

export const PLUGIN_PACKAGE: PackageInterface = {
  slug,
  version,
  versions: {
    [version]: PLUGIN,
  },
};

export const REGISTRY: RegistryInterface = {
  name: 'Open Audio Registry',
  url: 'https://open-audio-stack.github.io/open-audio-stack-registry',
  version: '1.0.0',
};

test('Create new Registry', () => {
  const registry: RegistryLocal = new RegistryLocal(REGISTRY.name, REGISTRY.url, REGISTRY.version);
  expect(registry.toJSON()).toEqual(REGISTRY);
});

test('Create new Plugin Manager', () => {
  const manager: ManagerLocal = new ManagerLocal(RegistryType.Plugins, CONFIG);
  manager.scan('yaml', false);
  const pkg = manager.getPackage(PLUGIN_PACKAGE.slug);
  expect(pkg?.getVersion(PLUGIN_PACKAGE.version)).toEqual(PLUGIN);
});

test('Validate json index', () => {
  const registry: RegistryLocal = new RegistryLocal(REGISTRY.name, REGISTRY.url, REGISTRY.version);
  const manager: ManagerLocal = new ManagerLocal(RegistryType.Plugins, CONFIG);
  registry.addManager(manager);
  registry.scan('yaml', false);
  registry.export('out');
  const fileJSON = fileReadJson(path.join('out', 'index.json'));
  expect(fileJSON.name).toEqual(REGISTRY.name);
  expect(fileJSON.url).toEqual(REGISTRY.url);
  expect(fileJSON.version).toEqual(REGISTRY.version);
});

test('Validate json plugins', () => {
  const registry: RegistryLocal = new RegistryLocal(REGISTRY.name, REGISTRY.url, REGISTRY.version);
  const manager: ManagerLocal = new ManagerLocal(RegistryType.Plugins, CONFIG);
  registry.addManager(manager);
  registry.scan('yaml', false);
  registry.export('out');
  const fileJSON = fileReadJson(path.join('out', 'plugins', 'index.json'));
  expect(fileJSON[PLUGIN_PACKAGE.slug].slug).toEqual(PLUGIN_PACKAGE.slug);
});

test('Validate json org', () => {
  const registry: RegistryLocal = new RegistryLocal(REGISTRY.name, REGISTRY.url, REGISTRY.version);
  const manager: ManagerLocal = new ManagerLocal(RegistryType.Plugins, CONFIG);
  registry.addManager(manager);
  registry.scan('yaml', false);
  registry.export('out');
  const fileJSON = fileReadJson(path.join('out', 'plugins', PLUGIN_PACKAGE.slug.split('/')[0], 'index.json'));
  expect(fileJSON[PLUGIN_PACKAGE.slug].slug).toEqual(PLUGIN_PACKAGE.slug);
});

test('Validate json package', () => {
  const registry: RegistryLocal = new RegistryLocal(REGISTRY.name, REGISTRY.url, REGISTRY.version);
  const manager: ManagerLocal = new ManagerLocal(RegistryType.Plugins, CONFIG);
  registry.addManager(manager);
  registry.scan('yaml', false);
  registry.export('out');
  const fileJSON = fileReadJson(path.join('out', 'plugins', PLUGIN_PACKAGE.slug, 'index.json'));
  expect(fileJSON.versions[PLUGIN_PACKAGE.version]).toEqual(PLUGIN);
});

test('Validate json package version', () => {
  const registry: RegistryLocal = new RegistryLocal(REGISTRY.name, REGISTRY.url, REGISTRY.version);
  const manager: ManagerLocal = new ManagerLocal(RegistryType.Plugins, CONFIG);
  registry.addManager(manager);
  registry.scan('yaml', false);
  registry.export('out');
  const fileJSON = fileReadJson(path.join('out', 'plugins', PLUGIN_PACKAGE.slug, PLUGIN_PACKAGE.version, 'index.json'));
  expect(fileJSON).toEqual(PLUGIN);
});

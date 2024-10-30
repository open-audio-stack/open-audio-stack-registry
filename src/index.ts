import { FileSystem, PluginInterface, Registry } from '@open-audio-stack/core';

// Create filesystem and registry.
const fileSystem: FileSystem = new FileSystem();
fileSystem.dirCreate('./out');

const registry: Registry = new Registry({
  name: 'Open Audio Registry',
  packages: {},
  url: 'https://open-audio-stack.github.io/open-audio-stack-registry',
  version: '1.0.0',
});

// Load an example package.
const packageVersion = fileSystem.fileReadYaml('./src/packages/surge-synthesizer/surge/1.3.1.yaml') as PluginInterface;

// Validate package.
console.log(registry.packageVersionValidate(packageVersion));

// Add package to registry.
registry.packageVersionAdd('surge-synthesizer/surge', '1.3.1', packageVersion);

// Output the registry as json.
fileSystem.fileJsonCreate('./out/index.json', registry.get());

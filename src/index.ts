import { FileSystem, PluginInterface, Registry } from '@open-audio-stack/core';
import { generateArchitectures } from './config.js';

// Create filesystem and registry.
const fileSystem: FileSystem = new FileSystem();

const registry: Registry = new Registry({
  name: 'Open Audio Registry',
  packages: {},
  url: 'https://open-audio-stack.github.io/open-audio-stack-registry',
  version: '1.0.0',
});

// Load an example package.
const packageVersion = fileSystem.fileReadYaml(
  './src/plugins/surge-synthesizer/surge/1.3.1/index.yaml',
) as PluginInterface;

// Validate package.
console.log('packageVersionValidate', registry.packageVersionValidate(packageVersion));

// Add package to registry.
registry.packageVersionAdd('surge-synthesizer/surge', '1.3.1', packageVersion);
fileSystem.dirCreate('./out/plugins/surge-synthesizer/surge/1.3.1/');
fileSystem.fileJsonCreate('./out/plugins/surge-synthesizer/surge/1.3.1/index.json', registry.get());

// Output the registry as json.
fileSystem.fileJsonCreate('./out/index.json', registry.get());

generateArchitectures();

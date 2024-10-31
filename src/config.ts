import { Config, FileSystem } from '@open-audio-stack/core';

const config: Config = new Config({});
const fileSystem: FileSystem = new FileSystem();

export function generateArchitectures() {
  // Architectures.
  const architectures = config.architectures();
  const dirArch: string = './out/architectures';
  architectures.forEach(architecture => {
    const dir: string = `${dirArch}/${architecture.value}`;
    fileSystem.dirCreate(dir);
    fileSystem.fileJsonCreate(`${dir}/index.json`, architecture);
  });
  fileSystem.fileJsonCreate(`${dirArch}/index.json`, config.architectures());
}

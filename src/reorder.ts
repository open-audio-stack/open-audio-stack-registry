// This is a helper script to reorder yaml properties.

import path from 'path';
import { dirCreate, dirRead, fileCreate, fileReadYaml, PluginInterface } from '@open-audio-stack/core';
import yaml from 'js-yaml';

const pathIn: string = path.join('src', '**', '*.yaml');
const pathOut: string = path.join('reorder');
const filePaths: string[] = dirRead(pathIn);

const yamlOrder = [
  'name',
  'author',
  'description',
  'license',
  'type',
  'tags',
  'url',
  'donate',
  'audio',
  'image',
  'date',
  'changes',
  'files',
];
const filesOrder = ['systems', 'architectures', 'contains', 'format', 'type', 'size', 'sha256', 'url'];

filePaths.forEach((filePath: string) => {
  const pkgFile: PluginInterface = fileReadYaml(filePath) as PluginInterface;
  const outPath: string = filePath.replace('src', pathOut);
  dirCreate(path.dirname(outPath));
  fileCreate(
    outPath,
    yaml.dump(pkgFile, {
      lineWidth: -1,
      sortKeys: function (a, b) {
        const isFile: boolean = filesOrder.includes(a) && filesOrder.includes(b);
        const aIndex: number = isFile ? filesOrder.indexOf(a) : yamlOrder.indexOf(a);
        const bIndex: number = isFile ? filesOrder.indexOf(b) : yamlOrder.indexOf(b);
        return bIndex < aIndex ? 1 : bIndex > aIndex ? -1 : 0;
      },
    }),
  );
});

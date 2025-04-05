import { expect, test } from 'vitest';
import { Registry, RegistryInterface } from '@open-audio-stack/core';

export const REGISTRY: RegistryInterface = {
  name: 'Open Audio Registry',
  url: 'https://open-audio-stack.github.io/open-audio-stack-registry',
  version: '1.0.0',
};

test('Create new Registry', () => {
  const registry: Registry = new Registry(REGISTRY.name, REGISTRY.url, REGISTRY.version);
  expect(registry.toJSON()).toEqual(REGISTRY);
});

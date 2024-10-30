import { expect, test } from 'vitest';
import { Registry, RegistryInterface } from '@open-audio-stack/core';

export const REGISTRY: RegistryInterface = {
  name: 'Open Audio Registry',
  packages: {},
  url: 'https://open-audio-stack.github.io/open-audio-stack-registry',
  version: '1.0.0',
};

test('Create new Registry', () => {
  const registry: Registry = new Registry(REGISTRY);
  expect(registry.get()).toEqual(REGISTRY);
});

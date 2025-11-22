import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { join } from 'path';

test('Get config', async ({ request }) => {
  const endpoint = await request.get('https://open-audio-stack.github.io/open-audio-stack-registry/config/architectures');
  expect(endpoint.ok()).toBeTruthy();
  const remoteData = await endpoint.json();
  const localData = JSON.parse(readFileSync(join(process.cwd(), 'out/config/architectures/index.json'), 'utf-8'));
  expect(remoteData).toEqual(localData);
});

test('Get plugins', async ({ request }) => {
  const endpoint = await request.get('https://open-audio-stack.github.io/open-audio-stack-registry/plugins');
  expect(endpoint.ok()).toBeTruthy();
  const remoteData = await endpoint.json();
  const localData = JSON.parse(readFileSync(join(process.cwd(), 'out/plugins/index.json'), 'utf-8'));
  expect(remoteData).toEqual(localData);
});

test('Get presets', async ({ request }) => {
  const endpoint = await request.get('https://open-audio-stack.github.io/open-audio-stack-registry/presets');
  expect(endpoint.ok()).toBeTruthy();
  const remoteData = await endpoint.json();
  const localData = JSON.parse(readFileSync(join(process.cwd(), 'out/presets/index.json'), 'utf-8'));
  expect(remoteData).toEqual(localData);
});

test('Get projects', async ({ request }) => {
  const endpoint = await request.get('https://open-audio-stack.github.io/open-audio-stack-registry/projects');
  expect(endpoint.ok()).toBeTruthy();
  const remoteData = await endpoint.json();
  const localData = JSON.parse(readFileSync(join(process.cwd(), 'out/projects/index.json'), 'utf-8'));
  expect(remoteData).toEqual(localData);
});

test('Get registry', async ({ request }) => {
  const endpoint = await request.get('https://open-audio-stack.github.io/open-audio-stack-registry');
  expect(endpoint.ok()).toBeTruthy();
  const remoteData = await endpoint.json();
  const localData = JSON.parse(readFileSync(join(process.cwd(), 'out/index.json'), 'utf-8'));
  expect(remoteData).toEqual(localData);
});

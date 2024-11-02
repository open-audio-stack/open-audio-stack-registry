import { test, expect } from '@playwright/test';

test('Get registry', async ({ request }) => {
  const endpoint = await request.get('');
  expect(endpoint.ok()).toBeTruthy();
  expect(await endpoint.json()).toEqual({
    name: 'Open Audio Registry',
    packages: expect.any(Object),
    url: 'https://open-audio-stack.github.io/open-audio-stack-registry',
    version: '1.0.0',
  });
});

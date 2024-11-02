import { test, expect } from '@playwright/test';

test('Get registry', async ({ request }) => {
  const issues = await request.get('');
  expect(issues.ok()).toBeTruthy();
  expect(await issues.json()).toContainEqual(
    expect.objectContaining({
      title: '[Feature] request 1',
      body: 'Feature description',
    }),
  );
});

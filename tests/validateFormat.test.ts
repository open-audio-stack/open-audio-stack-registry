import { expect, test } from 'vitest';
import { packageErrors, PackageVersion } from '@open-audio-stack/core';
import { closestOption, formatIssue, formatIssues, valueAtPath } from '../src/validateFormat.js';

test('closestOption suggests the nearest allowed value', () => {
  expect(closestOption('agpl3', ['mit', 'agpl-3.0', 'gpl-3.0'])).toBe('agpl-3.0');
  expect(closestOption('efect', ['effect', 'instrument', 'tool'])).toBe('effect');
  expect(closestOption('MIT', ['mit', 'apache-2.0'])).toBe('mit');
  expect(closestOption('zzzzzz', ['effect', 'instrument'])).toBeUndefined();
});

test('valueAtPath reads nested values', () => {
  expect(valueAtPath({ files: [{ type: 'zip' }] }, ['files', 0, 'type'])).toBe('zip');
  expect(valueAtPath({ files: [] }, ['files', 3, 'type'])).toBeUndefined();
});

test('formatIssue reports missing fields', () => {
  const line = formatIssue({ code: 'invalid_type', expected: 'string', path: ['changes'], message: '' }, {});
  expect(line).toBe('- changes: required field is missing (expected string)');
});

test('formatIssue lists small enums and suggests a value', () => {
  const issue = { code: 'invalid_value', values: ['archive', 'installer'], path: ['files', 0, 'type'], message: '' };
  expect(formatIssue(issue, { files: [{ type: 'archve' }] })).toBe(
    "- files.0.type: 'archve' is not an allowed value. Did you mean 'archive'? Allowed: archive, installer",
  );
});

test('formatIssues output for a real package has no raw JSON', () => {
  const pkg = { name: 'Two Filters', license: 'agpl3' } as unknown as PackageVersion;
  const output = formatIssues('baconpaul/two-filters/1.0.0', packageErrors(pkg), pkg);
  expect(output.split('\n')[0]).toBe('X baconpaul/two-filters/1.0.0');
  expect(output).toContain("- license: 'agpl3' is not an allowed value. Did you mean 'agpl-3.0'?");
  expect(output).toContain('- changes: required field is missing (expected string)');
  expect(output).not.toContain('"code"');
});

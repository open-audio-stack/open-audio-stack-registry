import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { afterEach, beforeEach, expect, test } from 'vitest';
import { jpgPathFor, resolvePngImage, setYamlImageToJpg } from '../src/image.js';

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'oas-image-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

test('jpgPathFor swaps the extension', () => {
  expect(jpgPathFor('src/plugins/a/b/b.png')).toBe('src/plugins/a/b/b.jpg');
  expect(jpgPathFor('src/plugins/a/b/b.PNG')).toBe('src/plugins/a/b/b.jpg');
});

test('setYamlImageToJpg only changes the image line', () => {
  const yaml = 'name: B\nimage: https://example.com/b/b.png\naudio: https://example.com/b/b.png.flac\n';
  expect(setYamlImageToJpg(yaml)).toBe(
    'name: B\nimage: https://example.com/b/b.jpg\naudio: https://example.com/b/b.png.flac\n',
  );
  expect(setYamlImageToJpg("image: 'https://example.com/b.png'\n")).toBe("image: 'https://example.com/b.jpg'\n");
});

test('resolvePngImage does nothing when the jpg exists', () => {
  writeFileSync(path.join(dir, 'b.jpg'), '');
  expect(resolvePngImage('index.yaml', path.join(dir, 'b.jpg'), true)).toEqual({ status: 'none' });
});

test('resolvePngImage fails in CI when the yaml points at a png', () => {
  writeFileSync(path.join(dir, 'b.png'), '');
  const result = resolvePngImage('index.yaml', path.join(dir, 'b.png'), true);
  expect(result.status).toBe('error');
  expect(result.status === 'error' && result.message).toContain('npm run dev:validate -- index.yaml');
});

test('resolvePngImage fails in CI when only the png is committed', () => {
  writeFileSync(path.join(dir, 'b.png'), '');
  expect(resolvePngImage('index.yaml', path.join(dir, 'b.jpg'), true).status).toBe('error');
});

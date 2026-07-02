// One-time script: converts all-lowercase tags to Title Case across the registry.
// Only tags where every letter is lowercase are touched; tags with any uppercase
// (acronyms, brands, already-correct) are left unchanged.
// Usage: npm run dev:fix-tags

import { readdirSync, readFileSync, writeFileSync, statSync } from 'fs';
import { join } from 'path';

function slugToTitleCase(slug: string): string {
  return slug
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .split(/[-_\s]+/)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function fixTag(tag: string): string {
  // Only fix tags that are entirely lowercase (no uppercase letters at all)
  if (/[a-z]/.test(tag) && !/[A-Z]/.test(tag)) {
    return slugToTitleCase(tag);
  }
  return tag;
}

function findYamlFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      results.push(...findYamlFiles(full));
    } else if (entry === 'index.yaml') {
      results.push(full);
    }
  }
  return results;
}

let filesChanged = 0;
let tagsFixed = 0;

for (const filePath of findYamlFiles('src')) {
  const original = readFileSync(filePath, 'utf8');

  const updated = original.replace(/(^tags:\n)((?: {2}- .+\n)*)/m, (_, header, tagLines) => {
    const fixedLines = tagLines.replace(/^( {2}- )(.+)$/gm, (_line: string, prefix: string, tag: string) => {
      const fixed = fixTag(tag.trim());
      if (fixed !== tag.trim()) tagsFixed++;
      return `${prefix}${fixed}`;
    });
    return header + fixedLines;
  });

  if (updated !== original) {
    writeFileSync(filePath, updated, 'utf8');
    console.log(`Fixed: ${filePath}`);
    filesChanged++;
  }
}

console.log(`\n${tagsFixed} tag(s) updated across ${filesChanged} file(s).`);

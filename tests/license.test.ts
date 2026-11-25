import { expect, test } from 'vitest';
import { detectLicenseFromReadme, detectLicenseFromText, licenseFromName } from '../src/license.js';

test('licenseFromName maps common short names', () => {
  expect(licenseFromName('MIT')).toBe('mit');
  expect(licenseFromName('MIT License')).toBe('mit');
  expect(licenseFromName('GPLv3')).toBe('gpl-3.0');
  expect(licenseFromName('GPL v3')).toBe('gpl-3.0');
  expect(licenseFromName('GPL-3.0-or-later')).toBe('gpl-3.0');
  expect(licenseFromName('GNU GPL v2')).toBe('gpl-2.0');
  expect(licenseFromName('Apache 2.0')).toBe('apache-2.0');
  expect(licenseFromName('Proprietary')).toBeNull();
});

test('detectLicenseFromText still reads canonical LICENSE files', () => {
  expect(detectLicenseFromText('Permission is hereby granted, free of charge, to any person obtaining a copy')).toBe(
    'mit',
  );
  expect(detectLicenseFromText('Waxman is released under the MIT license.\n\nPermission to use, copy...')).toBe('mit');
});

test('detectLicenseFromReadme reads a License section with a link (ryanb3/adaptive-eq, #579)', () => {
  const readme =
    '# Adaptive EQ\n\nSome text.\n\n## License\nThis project is licensed under the [MIT License](LICENSE).\n';
  expect(detectLicenseFromReadme(readme)).toBe('mit');
});

test('detectLicenseFromReadme reads a bare name under a License heading', () => {
  expect(detectLicenseFromReadme('# Plugin\n\n## Licence\n\nGPLv3\n\n## Credits\nUses JUCE (AGPL)')).toBe('gpl-3.0');
  expect(detectLicenseFromReadme('Plugin\n\nLicense\n-------\nApache 2.0\n')).toBe('apache-2.0');
  expect(detectLicenseFromReadme('**License:**\nMIT\n')).toBe('mit');
});

test('detectLicenseFromReadme reads an explicit sentence or a badge', () => {
  expect(detectLicenseFromReadme('This plugin is distributed under the terms of the GPL-3.0 license.')).toBe('gpl-3.0');
  expect(detectLicenseFromReadme('![license](https://img.shields.io/badge/license-MIT-blue.svg)')).toBe('mit');
});

test('detectLicenseFromReadme ignores licenses of dependencies outside a License section', () => {
  expect(detectLicenseFromReadme('# Plugin\n\nBuilt with JUCE, which is GPLv3 or commercial.\n')).toBeNull();
  expect(detectLicenseFromReadme('# Plugin\n\n## License\n\nAll rights reserved.\n')).toBeNull();
});

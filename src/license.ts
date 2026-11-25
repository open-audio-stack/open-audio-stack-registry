// ── License detection ──────────────────────────────────────────────────────────

// Map a short license name, as people write it in prose ("MIT", "GPLv3", "Apache 2.0"), to a registry id.
export function licenseFromName(rawName: string): string | null {
  const name = rawName
    .trim()
    .toLowerCase()
    .replace(/^the\s+/, '')
    .replace(/\s+licen[sc]e$/, '')
    .replace(/-(only|or-later)$/, '')
    .replace(/^gnu\s+(?=[al]?gpl)/, '')
    .replace(/(gpl)\s+v?(?=\d)/, '$1v')
    .replace(/(gpl)v(\d)\.0/, '$1v$2');
  const declaredMap: Array<[RegExp, string]> = [
    [/^mit$/, 'mit'],
    [/^isc$/, 'isc'],
    [/^(bsd-?3(-clause)?|bsd 3-clause)$/, 'bsd-3-clause'],
    [/^(bsd-?2(-clause)?|bsd 2-clause)$/, 'bsd-2-clause'],
    [/^apache(?:-| )?2\.0$/, 'apache-2.0'],
    [/^mpl(?:-| )?2\.0$/, 'mpl-2.0'],
    [/^(gpl-?3(\.0)?\+?|gplv3\+?)$/, 'gpl-3.0'],
    [/^(gpl-?2(\.0)?\+?|gplv2\+?)$/, 'gpl-2.0'],
    [/^(lgpl-?2\.1\+?|lgplv2\.1\+?)$/, 'lgpl-2.1'],
    [/^(lgpl-?3(\.0)?\+?|lgplv3\+?)$/, 'lgpl-3.0'],
    // "AGPL" bare, or spelled out in full with no version number, still resolves to agpl-3.0:
    // unlike GPL/LGPL (where v2 still sees meaningful real-world use, so an unversioned
    // mention is genuinely ambiguous), AGPL v1 was never released — every AGPL license in
    // circulation is v3, so there's no other version an unqualified mention could mean.
    // Seen on Davit-G/Hamburger: "licensed under the GNU Affero General Public License
    // (GNU AGPL)" with no version number anywhere near it.
    [/^(agpl-?3(\.0)?\+?|agplv3\+?|agpl|gnu affero general public(?: license)?)$/, 'agpl-3.0'],
    [/^zlib$/, 'zlib'],
    [/^(0bsd|bsd zero-?clause)$/, '0bsd'],
    [/^cc0(?:-1\.0)?$/, 'cc0-1.0'],
    [/^unlicense$/, 'unlicense'],
    [/^wtfpl$/, 'wtfpl'],
    [/^(bsl(?:-| )?1\.0|boost software license.*)$/, 'bsl-1.0'],
  ];
  for (const [re, id] of declaredMap) if (re.test(name)) return id;
  return null;
}

// GitHub's license detector is a similarity classifier, not a human — it regularly comes back
// `other`/null for a repo that ships a perfectly standard license under an unusual filename, with
// extra project-specific header lines, or phrased as a short "under the terms of the GNU GPL v3"
// notice rather than the full canonical block. When that happens, fetch the LICENSE file's own
// text and pattern-match it directly. Order matters: AGPL/LGPL are checked before plain GPL since
// their canonical text contains "General Public License" as a substring too.
export function detectLicenseFromText(text: string): string | null {
  // Collapse whitespace (including hard line-wraps at ~80 columns, extremely common in
  // LICENSE files) before matching — a fingerprint phrase spanning a wrap point otherwise
  // silently fails to match even though the license text is a byte-for-byte standard copy.
  const t = text.slice(0, 4000).replace(/\s+/g, ' ');
  const has = (re: RegExp) => re.test(t);

  // Some LICENSE files aren't a single canonical text — they attribute the project's own
  // license up top, then quote the license text of each bundled third-party dependency
  // below (DPF, JUCE, etc.), each with its own boilerplate body. Full-text pattern matching
  // below can latch onto a *bundled dependency's* canonical paragraph before ever reaching
  // the project's own (seen on SpotlightKid/waxman: its LICENSE.md says "Waxman is released
  // under the MIT license" but happens to phrase that grant using ISC's canonical wording,
  // while a genuinely ISC-licensed dependency is quoted further down — full-text matching
  // picked ISC for the whole package, which PR #819's author corrected). An explicit
  // "released/licensed under the X license" declaration is a stronger, more direct signal
  // of the *project's* license than boilerplate text-sniffing, so check for the first such
  // declaration before falling back to full-text matching.
  const declared = t.match(
    /(?:is |^)(?:released|licen[sc]ed) under the ([A-Za-z0-9][A-Za-z0-9.+\- ]{1,40}?) licen[sc]e/i,
  );
  if (declared) {
    const id = licenseFromName(declared[1]);
    if (id) return id;
    // Declared name didn't match a known id (could be a bundled third-party component's
    // license further down the file) — fall through to full-text matching below.
  }

  if (has(/BSD Zero-?Clause License/i)) return '0bsd';
  if (has(/unencumbered software released into the public domain/i)) return 'unlicense';
  if (has(/DO WHAT THE FUCK YOU WANT TO PUBLIC LICENSE/i)) return 'wtfpl';
  if (has(/CC0 1\.0 Universal|Creative Commons Zero/i)) return 'cc0-1.0';
  if (has(/Permission to use, copy, modify, and\/?or distribute this software for any purpose with or without fee/i))
    return 'isc';
  if (has(/Apache License[\s\S]{0,40}Version 2\.0/i)) return 'apache-2.0';
  if (has(/Mozilla Public License[\s\S]{0,20}2\.0/i)) return 'mpl-2.0';
  if (has(/GNU Affero General Public License/i)) return has(/version 3/i) ? 'agpl-3.0' : null;
  if (has(/GNU Lesser General Public License/i))
    return has(/version 3/i) ? 'lgpl-3.0' : has(/version 2\.1/i) ? 'lgpl-2.1' : null;
  if (has(/GNU General Public License/i)) return has(/version 3/i) ? 'gpl-3.0' : has(/version 2/i) ? 'gpl-2.0' : null;
  if (has(/Redistributions of source code must retain[\s\S]*Redistributions in binary form/i))
    return has(/Neither the name/i) ? 'bsd-3-clause' : 'bsd-2-clause';
  if (has(/This software is provided ['"]as-is['"], without any express or implied warranty/i)) return 'zlib';
  if (has(/Permission is hereby granted, free of charge, to any person obtaining a copy/i)) return 'mit';
  return null;
}

// Short license names as they appear in README prose or a license section, e.g. "MIT", "GPLv3", "Apache 2.0".
const LICENSE_NAME_PATTERN =
  /\b(?:a?gpl|lgpl)(?:-|\s)?v?\d(?:\.\d)?\+?(?:-only|-or-later)?|\b(?:mit|isc|zlib|cc0(?:-1\.0)?|unlicense|wtfpl|0bsd)\b|\bapache(?:-|\s)2\.0\b|\bmpl(?:-|\s)2\.0\b|\bbsd(?:-|\s)[23]-clause\b/i;

// Text under a "License"/"Licensing" heading in a README, up to the next heading of any level.
function readmeLicenseSection(readme: string): string | null {
  const lines = readme.split(/\r?\n/);
  const isHeading = (line: string) => /^#{1,6}\s/.test(line);
  const isLicenseHeading = (line: string, next = '') =>
    /^#{1,6}\s*\W*\s*licen[sc](?:e|ing)\b/i.test(line) ||
    /^\s*\*\*\s*licen[sc](?:e|ing)\s*:?\s*\*\*\s*:?\s*$/i.test(line) ||
    (/^\s*licen[sc](?:e|ing)\s*$/i.test(line) && /^\s*(=+|-+)\s*$/.test(next));
  const start = lines.findIndex((line, i) => isLicenseHeading(line, lines[i + 1]));
  if (start === -1) return null;
  const body: string[] = [];
  for (let i = start + 1; i < lines.length; i++) {
    if (isHeading(lines[i]) || (i > start + 1 && /^\s*(=+|-+)\s*$/.test(lines[i]) && lines[i - 1].trim())) break;
    body.push(lines[i]);
  }
  return body.join('\n').trim() || null;
}

// Some repos only state their license in the README (e.g. "## License\nMIT"), with no LICENSE file
// GitHub can classify. Only trust the parts of a README that are about the project's own license:
// a License section, an explicit "released/licensed under the X license" sentence, or a license badge.
// Never run full-text matching over the whole README, which often mentions dependencies' licenses.
export function detectLicenseFromReadme(readme: string): string | null {
  const section = readmeLicenseSection(readme);
  if (section) {
    // Strip markdown links/images so "[MIT](LICENSE)" reads as "MIT".
    const text = section.replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1');
    const fromText = detectLicenseFromText(text);
    if (fromText) return fromText;
    const name = text.match(LICENSE_NAME_PATTERN);
    if (name) {
      const id = licenseFromName(name[0]);
      if (id) return id;
    }
  }
  const declared = readme.match(
    /(?:released|licen[sc]ed|distributed|available) under (?:the )?(?:terms of the )?([A-Za-z0-9][A-Za-z0-9.+\- ]{1,40}?) licen[sc]e/i,
  );
  if (declared) {
    const id = licenseFromName(declared[1]);
    if (id) return id;
  }
  const badge = readme.match(/img\.shields\.io\/(?:badge|github\/license)\/licen[sc]e-([^-/)?\s]+(?:--[^-/)?\s]+)*)-/i);
  if (badge) {
    const id = licenseFromName(decodeURIComponent(badge[1]).replace(/--/g, '-').replace(/_/g, ' '));
    if (id) return id;
  }
  return null;
}

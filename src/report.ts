import { logReport, PackageValidationRec } from '@open-audio-stack/core';

const report: any = {};

export function getReport() {
  return report;
}

export function updateReport(
  pkgSlug: string,
  pkgVersion: string,
  fileLocalPath: string,
  errors: any[] = [],
  recs: PackageValidationRec[] = [],
) {
  logReport(`${pkgSlug} | ${pkgVersion} | ${fileLocalPath}`, errors, recs);
  if (errors.length === 0 && recs.length === 0) return;
  if (!report[pkgSlug]) report[pkgSlug] = {};
  if (!report[pkgSlug][pkgVersion]) report[pkgSlug][pkgVersion] = {};
  if (errors.length) report[pkgSlug][pkgVersion].errors = errors;
  if (recs.length) report[pkgSlug][pkgVersion].recs = recs;
}

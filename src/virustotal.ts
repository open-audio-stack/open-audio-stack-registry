import { createHash } from 'crypto';

// VirusTotal helpers shared by `npm run dev:validate` and the CI VirusTotal report.
// A release url can be submitted for scanning in three places:
//   1. locally, when `npm run dev:validate` runs with VT_API_KEY set
//   2. in CI, when the workflow has VT_API_KEY available (not on fork PRs)
//   3. by anyone opening the search link, which redirects to the url report and starts a scan
// When a file's sha256 is known, its file report (the antivirus results for the downloaded binary) is
// used. The url report only says whether the link itself is a malicious website, so a flagged binary
// can show 0 flags there. It is used only when VirusTotal has no file report yet.
// Public API is limited to 4 requests/min, so requests are paced and only made when needed.

const API = 'https://www.virustotal.com/api/v3';

export type VtSubmitted = 'yes' | 'no' | 'unknown';

export interface VtResult {
  url: string;
  link: string;
  // Whether the url has been submitted to VirusTotal, tracked separately from the scan result
  submitted: VtSubmitted;
  // 'N flags', 'pending', or empty when there is no result to show
  result: string;
  flags?: number;
  // Engines that flagged the file, e.g. 'APEX: Malicious'
  detections?: string[];
}

export interface VtFile {
  url: string;
  sha256?: string;
}

export interface VtOptions {
  apiKey?: string;
  // Submit urls VirusTotal has not seen yet (default true)
  submit?: boolean;
  // Look up each url before submitting (default true). Without it every url is submitted directly,
  // which needs half the requests but gives no scan result, only 'pending'.
  lookup?: boolean;
  log?: (message: string) => void;
  wait?: (ms: number) => Promise<void>;
  fetchFn?: typeof fetch;
}

// Id of a url report: sha256 of the url string
export function vtUrlId(url: string): string {
  return createHash('sha256').update(url).digest('hex');
}

// Always-valid link: redirects to the url report and starts a scan if the url has not been scanned
export function vtSearchLink(url: string): string {
  return `https://www.virustotal.com/gui/search?query=${encodeURIComponent(url)}`;
}

export function vtFileLink(sha256: string): string {
  return `https://www.virustotal.com/gui/file/${sha256}`;
}

// A file VirusTotal has never analysed. Submitting its url does not scan the file: it has to be uploaded.
export const NOT_SCANNED = 'not scanned';

function flagsText(flags: number): string {
  return `${flags} ${flags === 1 ? 'flag' : 'flags'}`;
}

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

export async function vtScanUrls(files: (string | VtFile)[], options: VtOptions = {}): Promise<VtResult[]> {
  const { apiKey, submit = true, lookup = true } = options;
  const log = options.log || (() => {});
  const wait = options.wait || sleep;
  const fetchFn = options.fetchFn || fetch;

  const inputs: VtFile[] = files.map(f => (typeof f === 'string' ? { url: f } : f));
  const results: VtResult[] = inputs.map(({ url }) => ({
    url,
    link: vtSearchLink(url),
    submitted: 'unknown',
    result: '',
  }));
  if (!apiKey) return results;

  // Wait between requests (not after the last one) to stay within the free limit, and on 429 pause and retry once
  let requests = 0;
  const request = async (input: string, init: RequestInit): Promise<Response> => {
    if (requests++ > 0) await wait(15000);
    let res = await fetchFn(input, init);
    if (res.status === 429) {
      log(`VirusTotal rate limited, retrying in 60s: ${input}`);
      await wait(60000);
      res = await fetchFn(input, init);
    }
    return res;
  };

  const submitUrl = async (entry: VtResult): Promise<boolean> => {
    const post = await request(`${API}/urls`, {
      method: 'POST',
      headers: { 'x-apikey': apiKey, 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ url: entry.url }),
    });
    if (post.ok) {
      entry.submitted = 'yes';
      entry.result = 'pending';
      log(`Submitted to VirusTotal: ${entry.url}`);
    } else if (post.status === 429) {
      entry.submitted = 'unknown';
      log('VirusTotal rate limit still reached after retry, skipping remaining files');
      return true;
    } else log(`VirusTotal submit failed (${post.status}): ${entry.url}`);
    return false;
  };

  let quotaExhausted = false;
  // The file report for a known sha256: true when it gave a result, false to fall back to the url report
  const fileReport = async (entry: VtResult, sha256: string): Promise<boolean> => {
    const res = await request(`${API}/files/${sha256}`, { headers: { 'x-apikey': apiKey } });
    if (res.status === 429) {
      quotaExhausted = true;
      log('VirusTotal rate limit still reached after retry, skipping remaining files');
      return true;
    }
    if (!res.ok) {
      if (res.status !== 404) log(`VirusTotal file lookup failed (${res.status}): ${entry.url}`);
      return false;
    }
    const attrs = ((await res.json()) as any).data?.attributes || {};
    const stats: Record<string, number> = attrs.last_analysis_stats || {};
    entry.submitted = 'yes';
    entry.link = vtFileLink(sha256);
    if (!attrs.last_analysis_date || !Object.values(stats).reduce((a, b) => a + b, 0)) {
      entry.result = 'pending'; // uploaded, analysis still queued
      return true;
    }
    entry.flags = (stats.malicious || 0) + (stats.suspicious || 0);
    entry.result = flagsText(entry.flags);
    entry.detections = Object.entries((attrs.last_analysis_results || {}) as Record<string, any>)
      .filter(([, r]) => r.category === 'malicious' || r.category === 'suspicious')
      .map(([engine, r]) => `${engine}: ${r.result || r.category}`);
    return true;
  };

  for (const [i, entry] of results.entries()) {
    if (quotaExhausted) break;
    try {
      const sha256 = inputs[i].sha256;
      if (lookup && sha256 && (await fileReport(entry, sha256))) continue;
      if (quotaExhausted) break;
      if (!lookup) {
        if (submit) quotaExhausted = await submitUrl(entry);
        continue;
      }
      const res = await request(`${API}/urls/${vtUrlId(entry.url)}`, { headers: { 'x-apikey': apiKey } });
      if (res.ok) {
        const attrs = ((await res.json()) as any).data.attributes || {};
        const stats: Record<string, number> = attrs.last_analysis_stats || {};
        const scanned = Object.values(stats).reduce((a, b) => a + b, 0);
        entry.submitted = 'yes';
        // The url report only rates the link, so never present it as the file's result
        if (sha256) entry.result = NOT_SCANNED;
        else if (!attrs.last_analysis_date || !scanned) entry.result = 'pending';
        else {
          entry.flags = (stats.malicious || 0) + (stats.suspicious || 0);
          entry.result = flagsText(entry.flags);
        }
      } else if (res.status === 404) {
        entry.submitted = 'no';
        if (submit) quotaExhausted = await submitUrl(entry);
        if (sha256 && entry.result === 'pending') entry.result = NOT_SCANNED;
      } else if (res.status === 429) {
        quotaExhausted = true;
        log('VirusTotal rate limit still reached after retry, skipping remaining files');
      } else log(`VirusTotal lookup failed (${res.status}): ${entry.url}`);
    } catch (e) {
      log(`VirusTotal request failed: ${entry.url} ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return results;
}

export interface VtReportEntry {
  pkg: string;
}

// Markdown report posted as a PR comment by CI, one row per file.
export function vtReport(entries: VtReportEntry[], results: VtResult[], hasKey: boolean): string {
  let totalFlags = 0;
  let output =
    'VirusTotal Report:\n\n| Package | File | Submitted | Result | Scan |\n| --- | --- | --- | --- | --- |\n';
  results.forEach((r, i) => {
    totalFlags += r.flags || 0;
    const fileName = r.url.split('/').pop();
    const engines = r.detections && r.detections.length ? ` (${r.detections.join(', ')})` : '';
    output += `| ${entries[i].pkg} | ${fileName} | ${r.submitted} | ${r.result}${engines} | [VirusTotal](${r.link}) |\n`;
  });
  if (hasKey) output += `\nTotal flags: ${totalFlags}\n`;
  output +=
    '\nResults are the antivirus engines that flagged the file itself. `not scanned` means VirusTotal has never analysed this file, so it needs uploading. `pending` means a scan has not finished yet. Submitted is `unknown` when the status could not be read (for example on a fork PR) and `no` when the url has not been submitted. Opening a Scan link for a url starts a scan if it has not been scanned yet.\n';
  return output;
}

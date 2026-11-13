import { createHash } from 'crypto';

// VirusTotal helpers shared by `npm run dev:validate` and the CI VirusTotal report.
// A release url can be submitted for scanning in three places:
//   1. locally, when `npm run dev:validate` runs with VT_API_KEY set
//   2. in CI, when the workflow has VT_API_KEY available (not on fork PRs)
//   3. by anyone opening the search link, which redirects to the url report and starts a scan
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

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

export async function vtScanUrls(urls: string[], options: VtOptions = {}): Promise<VtResult[]> {
  const { apiKey, submit = true, lookup = true } = options;
  const log = options.log || (() => {});
  const wait = options.wait || sleep;
  const fetchFn = options.fetchFn || fetch;

  const results: VtResult[] = urls.map(url => ({
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
  for (const entry of results) {
    if (quotaExhausted) break;
    try {
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
        if (!attrs.last_analysis_date || !scanned) entry.result = 'pending';
        else {
          entry.flags = (stats.malicious || 0) + (stats.suspicious || 0);
          entry.result = `${entry.flags} ${entry.flags === 1 ? 'flag' : 'flags'}`;
        }
      } else if (res.status === 404) {
        entry.submitted = 'no';
        if (submit) quotaExhausted = await submitUrl(entry);
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

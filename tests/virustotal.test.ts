import { expect, test } from 'vitest';
import { vtScanUrls, vtSearchLink, vtUrlId } from '../src/virustotal.js';

const URL1 = 'https://github.com/ZL-Audio/ZLEqualizer/releases/download/1.4.1/ZL.Equalizer.2-1.4.1-macOS-x86-64.dmg';
const report = (malicious: number, suspicious: number, date = 1) => ({
  ok: true,
  status: 200,
  json: async () => ({
    data: {
      attributes: {
        last_analysis_date: date,
        last_analysis_stats: { malicious, suspicious, harmless: 70, undetected: 5 },
      },
    },
  }),
});
const status = (code: number) => ({ ok: code >= 200 && code < 300, status: code });
const noWait = async () => {};

// Build a fetch mock that answers from a queue and records the calls
function mock(...responses: any[]) {
  const calls: string[] = [];
  const fetchFn = (async (input: string, init: RequestInit) => {
    calls.push(`${init?.method || 'GET'} ${input.split('/api/v3')[1]}`);
    return responses.shift();
  }) as unknown as typeof fetch;
  return { fetchFn, calls };
}

test('url id and search link are deterministic', () => {
  expect(vtUrlId(URL1)).toBe('4e4fe306e90d7376a83d8a861732081c34299a7ec1e99e3b5ada9ddd82940720');
  expect(vtSearchLink(URL1)).toBe(`https://www.virustotal.com/gui/search?query=${encodeURIComponent(URL1)}`);
});

test('no api key makes no requests, status unknown, link still present', async () => {
  const { fetchFn, calls } = mock();
  const [r] = await vtScanUrls([URL1], { fetchFn, wait: noWait });
  expect(calls).toEqual([]);
  expect(r).toMatchObject({ submitted: 'unknown', result: '', link: vtSearchLink(URL1) });
});

test('already scanned url reports flags and is not resubmitted', async () => {
  const { fetchFn, calls } = mock(report(2, 1));
  const [r] = await vtScanUrls([URL1], { apiKey: 'k', fetchFn, wait: noWait });
  expect(calls).toEqual([`GET /urls/${vtUrlId(URL1)}`]);
  expect(r).toMatchObject({ submitted: 'yes', result: '3 flags', flags: 3 });
});

test('submitted but not finished is pending', async () => {
  const { fetchFn } = mock(report(0, 0, 0));
  const [r] = await vtScanUrls([URL1], { apiKey: 'k', fetchFn, wait: noWait });
  expect(r).toMatchObject({ submitted: 'yes', result: 'pending' });
});

test('unknown url is submitted when a key exists', async () => {
  const { fetchFn, calls } = mock(status(404), status(200));
  const [r] = await vtScanUrls([URL1], { apiKey: 'k', fetchFn, wait: noWait });
  expect(calls).toEqual([`GET /urls/${vtUrlId(URL1)}`, 'POST /urls']);
  expect(r).toMatchObject({ submitted: 'yes', result: 'pending' });
});

test('submit disabled leaves unknown url as not submitted', async () => {
  const { fetchFn, calls } = mock(status(404));
  const [r] = await vtScanUrls([URL1], { apiKey: 'k', submit: false, fetchFn, wait: noWait });
  expect(calls).toHaveLength(1);
  expect(r).toMatchObject({ submitted: 'no', result: '' });
});

test('submit failure leaves url as not submitted', async () => {
  const { fetchFn } = mock(status(404), status(500));
  const [r] = await vtScanUrls([URL1], { apiKey: 'k', fetchFn, wait: noWait });
  expect(r).toMatchObject({ submitted: 'no', result: '' });
});

test('single 429 is retried and recovers', async () => {
  const { fetchFn, calls } = mock(status(429), report(0, 0));
  const waits: number[] = [];
  const [r] = await vtScanUrls([URL1], { apiKey: 'k', fetchFn, wait: async ms => void waits.push(ms) });
  expect(calls).toHaveLength(2);
  expect(waits[0]).toBe(60000);
  expect(r).toMatchObject({ submitted: 'yes', result: '0 flags' });
});

test('quota exhausted stops further requests and leaves remaining urls unknown', async () => {
  const { fetchFn, calls } = mock(status(429), status(429));
  const results = await vtScanUrls([URL1, URL1 + '2', URL1 + '3'], { apiKey: 'k', fetchFn, wait: noWait });
  expect(calls).toHaveLength(2);
  expect(results.map(r => r.submitted)).toEqual(['unknown', 'unknown', 'unknown']);
  expect(results.every(r => r.link.startsWith('https://www.virustotal.com/gui/search'))).toBe(true);
});

test('quota hit while submitting stops the rest', async () => {
  const { fetchFn, calls } = mock(status(404), status(429), status(429));
  const results = await vtScanUrls([URL1, URL1 + '2'], { apiKey: 'k', fetchFn, wait: noWait });
  expect(calls).toHaveLength(3);
  expect(results.map(r => r.submitted)).toEqual(['unknown', 'unknown']);
});

test('lookup disabled submits directly with one request per url and no trailing wait', async () => {
  const { fetchFn, calls } = mock(status(200), status(200));
  const waits: number[] = [];
  const results = await vtScanUrls([URL1, URL1 + '2'], {
    apiKey: 'k',
    lookup: false,
    fetchFn,
    wait: async ms => void waits.push(ms),
  });
  expect(calls).toEqual(['POST /urls', 'POST /urls']);
  expect(waits).toEqual([15000]);
  expect(results.map(r => [r.submitted, r.result])).toEqual([
    ['yes', 'pending'],
    ['yes', 'pending'],
  ]);
});

test('lookup disabled stops on exhausted quota', async () => {
  const { fetchFn, calls } = mock(status(429), status(429));
  const results = await vtScanUrls([URL1, URL1 + '2'], { apiKey: 'k', lookup: false, fetchFn, wait: noWait });
  expect(calls).toHaveLength(2);
  expect(results.map(r => r.submitted)).toEqual(['unknown', 'unknown']);
});

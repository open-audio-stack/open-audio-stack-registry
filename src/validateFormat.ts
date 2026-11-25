// Minimal shape of a zod v4 issue, as returned by packageErrors() in @open-audio-stack/core.
export interface ValidationIssue {
  code: string;
  path: PropertyKey[];
  message: string;
  expected?: string;
  values?: readonly unknown[];
}

// Enums with more options than this are not listed in full, only the closest suggestion.
const MAX_OPTIONS_LISTED = 12;

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function levenshtein(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const temp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = temp;
    }
  }
  return prev[b.length];
}

// Suggest the closest allowed value, e.g. 'agpl3' -> 'agpl-3.0', 'efect' -> 'effect'.
export function closestOption(received: string, options: readonly unknown[]): string | undefined {
  const target = normalize(received);
  if (!target) return undefined;
  const values = options.map(String);
  const exact = values.find(opt => normalize(opt) === target);
  if (exact) return exact;
  let best: string | undefined;
  let bestDistance = Infinity;
  for (const opt of values) {
    const distance = levenshtein(target, normalize(opt));
    if (distance < bestDistance) {
      best = opt;
      bestDistance = distance;
    }
  }
  return bestDistance <= Math.max(1, Math.floor(target.length / 3)) ? best : undefined;
}

export function valueAtPath(data: unknown, path: PropertyKey[]): unknown {
  let current: unknown = data;
  for (const key of path) {
    if (current === null || typeof current !== 'object') return undefined;
    current = (current as Record<PropertyKey, unknown>)[key];
  }
  return current;
}

function describe(value: unknown): string {
  if (value === undefined) return 'nothing';
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'a list';
  if (typeof value === 'string') return `'${value}'`;
  return typeof value === 'object' ? 'an object' : `${typeof value} ${String(value)}`;
}

// Format a single issue as one human-readable line, instead of a raw JSON dump.
export function formatIssue(issue: ValidationIssue, data?: unknown): string {
  const field = issue.path.length ? issue.path.map(String).join('.') : '(root)';
  const received = valueAtPath(data, issue.path);
  switch (issue.code) {
    case 'invalid_type':
      if (received === undefined) return `- ${field}: required field is missing (expected ${issue.expected})`;
      return `- ${field}: expected ${issue.expected}, received ${describe(received)}`;
    case 'invalid_value': {
      const options = issue.values || [];
      const suggestion = typeof received === 'string' ? closestOption(received, options) : undefined;
      let line = `- ${field}: ${describe(received)} is not an allowed value.`;
      if (suggestion) line += ` Did you mean '${suggestion}'?`;
      if (options.length <= MAX_OPTIONS_LISTED) line += ` Allowed: ${options.join(', ')}`;
      else if (!suggestion) line += ' See specification.md for the allowed values.';
      return line;
    }
    default:
      return `- ${field}: ${issue.message}`;
  }
}

export function formatIssues(header: string, issues: ValidationIssue[], data?: unknown): string {
  return [`X ${header}`, ...issues.map(issue => formatIssue(issue, data))].join('\n');
}

type SearchObservation = {
  at: number;
  query: string;
  source: string;
  resultCount: number;
  correctedQuery: string | null;
};

const SEARCH_WINDOW_MS = 60 * 60 * 1000;
const MAX_SEARCH_OBSERVATIONS = 500;
const observations: SearchObservation[] = [];

export function normalizeSearchText(value: unknown) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function tokenizeSearchText(value: unknown) {
  return normalizeSearchText(value)
    .split(/\s+/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 2)
    .slice(0, 8);
}

function editDistance(left: string, right: string) {
  const a = normalizeSearchText(left);
  const b = normalizeSearchText(right);
  if (!a) return b.length;
  if (!b) return a.length;
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    let diagonal = previous[0];
    previous[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const above = previous[j];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      previous[j] = Math.min(previous[j] + 1, previous[j - 1] + 1, diagonal + cost);
      diagonal = above;
    }
  }
  return previous[b.length];
}

function similarity(left: string, right: string) {
  const a = normalizeSearchText(left);
  const b = normalizeSearchText(right);
  const longest = Math.max(a.length, b.length);
  if (!longest) return 1;
  return 1 - editDistance(a, b) / longest;
}

export function buildSearchDictionary(values: unknown[]) {
  const dictionary = new Map<string, string>();
  for (const raw of values) {
    const display = String(raw || "").replace(/\s+/g, " ").trim();
    const normalized = normalizeSearchText(display);
    if (normalized.length < 2 || normalized.length > 60) continue;
    if (!dictionary.has(normalized)) dictionary.set(normalized, display);
    for (const token of tokenizeSearchText(display)) {
      if (token.length >= 3 && !dictionary.has(token)) dictionary.set(token, display.includes(" ") ? token : display);
    }
  }
  return [...dictionary.entries()].map(([normalized, display]) => ({ normalized, display }));
}

export function suggestedCorrection(query: string, dictionary: Array<{ normalized: string; display: string }>) {
  const normalizedQuery = normalizeSearchText(query);
  const tokens = tokenizeSearchText(query);
  if (normalizedQuery.length < 3 || !tokens.length || dictionary.some((item) => item.normalized === normalizedQuery)) return null;

  const dictionaryTokens = dictionary.filter((item) => !item.normalized.includes(" ") && item.normalized.length >= 3);
  let changed = false;
  const correctedTokens = tokens.map((token) => {
    if (dictionaryTokens.some((item) => item.normalized === token)) return token;
    const candidates = dictionaryTokens
      .filter((item) => Math.abs(item.normalized.length - token.length) <= 2 && item.normalized[0] === token[0])
      .map((item) => ({ ...item, score: similarity(token, item.normalized) }))
      .filter((item) => item.score >= (token.length <= 4 ? 0.74 : 0.68))
      .sort((a, b) => b.score - a.score || a.normalized.length - b.normalized.length);
    if (!candidates.length) return token;
    changed = true;
    return candidates[0].normalized;
  });
  if (!changed) return null;
  const corrected = correctedTokens.join(" ");
  return corrected !== normalizedQuery ? corrected : null;
}

export function relatedSearchTerms(query: string, dictionary: Array<{ normalized: string; display: string }>, limit = 6) {
  const normalized = normalizeSearchText(query);
  const tokens = tokenizeSearchText(query);
  if (!normalized) return [];
  const scored = dictionary
    .filter((item) => item.normalized !== normalized && !tokens.includes(item.normalized) && item.display.length >= 3 && item.display.length <= 42)
    .map((item) => {
      let score = item.normalized.startsWith(normalized) ? 1 : item.normalized.includes(normalized) ? 0.92 : 0;
      for (const token of tokens) {
        if (item.normalized.startsWith(token)) score = Math.max(score, 0.88);
        else if (item.normalized.includes(token)) score = Math.max(score, 0.78);
        else if (token.length >= 4) score = Math.max(score, similarity(token, item.normalized) * 0.72);
      }
      return { ...item, score };
    })
    .filter((item) => item.score >= 0.55)
    .sort((a, b) => b.score - a.score || a.display.localeCompare(b.display));

  const result: string[] = [];
  const seen = new Set<string>();
  for (const row of scored) {
    const key = normalizeSearchText(row.display);
    if (seen.has(key) || key === normalized) continue;
    seen.add(key);
    result.push(row.display);
    if (result.length >= Math.max(1, Math.min(10, limit))) break;
  }
  return result;
}

function safeObservedQuery(value: string) {
  const normalized = normalizeSearchText(value).slice(0, 48);
  if (!normalized) return "[empty]";
  if (String(value).includes("@") || /\d{7,}/.test(String(value))) return "[redacted]";
  return normalized;
}

export function recordSearchObservation(input: { query: string; source?: string; resultCount: number; correctedQuery?: string | null }) {
  const query = safeObservedQuery(input.query);
  const source = String(input.source || "search").replace(/[^a-z0-9_-]/gi, "").slice(0, 24) || "search";
  const now = Date.now();
  const recentDuplicate = observations.slice(-12).find((item) => item.query === query && item.source === source && now - item.at < 8000);
  if (recentDuplicate) {
    recentDuplicate.at = now;
    recentDuplicate.resultCount = Math.max(0, Math.round(Number(input.resultCount) || 0));
    recentDuplicate.correctedQuery = input.correctedQuery ? safeObservedQuery(input.correctedQuery) : null;
    return;
  }
  observations.push({
    at: now,
    query,
    source,
    resultCount: Math.max(0, Math.round(Number(input.resultCount) || 0)),
    correctedQuery: input.correctedQuery ? safeObservedQuery(input.correctedQuery) : null,
  });
  if (observations.length > MAX_SEARCH_OBSERVATIONS) observations.splice(0, observations.length - MAX_SEARCH_OBSERVATIONS);
}

export function searchDiscoverySnapshot() {
  const cutoff = Date.now() - SEARCH_WINDOW_MS;
  while (observations.length && observations[0].at < cutoff) observations.shift();
  const recent = observations.filter((item) => item.at >= cutoff);
  const zero = recent.filter((item) => item.resultCount === 0);
  const corrected = recent.filter((item) => Boolean(item.correctedQuery));
  const aggregate = (rows: SearchObservation[]) => {
    const map = new Map<string, number>();
    for (const item of rows) map.set(item.query, (map.get(item.query) || 0) + 1);
    return [...map.entries()].map(([query, count]) => ({ query, count })).sort((a, b) => b.count - a.count || a.query.localeCompare(b.query)).slice(0, 8);
  };
  const sourceMap = new Map<string, number>();
  for (const item of recent) sourceMap.set(item.source, (sourceMap.get(item.source) || 0) + 1);
  return {
    windowMinutes: SEARCH_WINDOW_MS / 60000,
    searchCount: recent.length,
    zeroResultCount: zero.length,
    zeroResultRatePercent: recent.length ? Number(((zero.length / recent.length) * 100).toFixed(1)) : 0,
    correctionCount: corrected.length,
    correctionRatePercent: recent.length ? Number(((corrected.length / recent.length) * 100).toFixed(1)) : 0,
    topQueries: aggregate(recent.filter((item) => item.query !== "[redacted]")),
    zeroResultQueries: aggregate(zero.filter((item) => item.query !== "[redacted]")),
    sources: [...sourceMap.entries()].map(([source, count]) => ({ source, count })).sort((a, b) => b.count - a.count),
  };
}

import { httpFetch } from "./http.ts";

// Google Custom Search Engine, ported from SearXNG's `google_cse` engine: a CSE
// exposes the regular Google index as JSONP with no API key, so results come
// straight from Google instead of through somebody's SearXNG instance.
// https://github.com/searxng/searxng/blob/master/searx/engines/google_cse.py

const CX = "partner-pub-8993703457585266:4862972284"; // blackle.com
const LIBRARY_URL = `https://www.google.com/cse/cse.js?cx=${CX}`;
const ENDPOINT = "https://cse.google.com/cse/element/v1";

const PAGE_SIZE = 20;
const MAX_PAGE = 5;
const TOKEN_TTL_MS = 60 * 60 * 1000;

/** Filter results: `off` | `medium` | `high`. */
const SAFE = "medium";

/** A single search result. */
export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

export interface SearchOptions {
  /** Maximum number of results to return. */
  limit?: number;
  signal?: AbortSignal;
}

interface CseToken {
  token: string;
  version: string;
  exp: string;
}

interface CseResponse {
  error?: { code?: number; message?: string };
  results?: {
    unescapedUrl?: string;
    titleNoFormatting?: string;
    contentNoFormatting?: string;
  }[];
}

let cachedToken: CseToken | undefined;
let cachedTokenExpiresAt = 0;

/** Mint the token the element endpoint demands, caching it until it expires. */
async function cseToken(signal?: AbortSignal): Promise<CseToken> {
  if (cachedToken && Date.now() < cachedTokenExpiresAt) return cachedToken;

  const response = await httpFetch(LIBRARY_URL, {
    headers: { Accept: "*/*" },
    signal,
  });
  if (!response.ok) {
    throw new Error(
      `Failed to obtain a Google CSE token: ${response.status} ${response.statusText}`,
    );
  }

  const text = await response.text();
  // The library script ends with one options object: `...});`.
  const options = JSON.parse(
    text.slice(text.lastIndexOf("({") + 1, text.lastIndexOf("});") + 1),
  ) as { cse_token?: string; cselibVersion?: string; exp?: string[] };
  if (!options.cse_token) {
    throw new Error("Google CSE library script carries no token");
  }

  cachedToken = {
    token: options.cse_token,
    version: options.cselibVersion ?? "",
    exp: options.exp?.join(",") ?? "",
  };
  cachedTokenExpiresAt = Date.now() + TOKEN_TTL_MS;
  return cachedToken;
}

/**
 * Google labels the interface by language (`hl`) and boosts results by country
 * (`gl`); both follow the host locale, so `de-DE` asks for `hl=de`, `gl=DE`.
 */
function localeParams(): Record<string, string> {
  const [language = "en", ...subtags] = Intl.DateTimeFormat()
    .resolvedOptions()
    .locale.split("-");
  // The region is the other two-letter subtag; script subtags (`Hans`) are four.
  const region = subtags.find((tag) => /^[A-Za-z]{2}$/.test(tag));
  return region ? { hl: language, gl: region.toUpperCase() } : { hl: language };
}

async function searchPage(
  query: string,
  start: number,
  signal?: AbortSignal,
): Promise<SearchResult[]> {
  const token = await cseToken(signal);

  const params = new URLSearchParams({
    rsz: "filtered_cse",
    num: String(PAGE_SIZE),
    ...localeParams(),
    cselibv: token.version,
    cx: CX,
    q: query,
    safe: SAFE,
    cse_tok: token.token,
    callback: "_",
    // Empty, but required: dropping `rurl` altogether gets a 403.
    rurl: "",
    searchtype: "",
  });
  if (token.exp) params.set("exp", token.exp);
  if (start) params.set("start", String(start));

  const response = await httpFetch(`${ENDPOINT}?${params}`, {
    headers: {
      Accept: "*/*",
      Referer: "https://cse.google.com/",
      Cookie: "CONSENT=YES+",
    },
    signal,
  });
  if (!response.ok) {
    throw new Error(
      `Search request failed: ${response.status} ${response.statusText}`,
    );
  }

  const text = await response.text();
  const data = JSON.parse(
    text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1),
  ) as CseResponse;
  if (data.error) {
    const { code, message } = data.error;
    throw new Error(
      `Google CSE search failed${code ? ` (${code})` : ""}: ${message ?? "unknown error"}`,
    );
  }

  const results: SearchResult[] = [];
  for (const item of data.results ?? []) {
    if (!item.unescapedUrl) continue;
    results.push({
      title: item.titleNoFormatting?.trim() ?? "",
      url: item.unescapedUrl,
      snippet: item.contentNoFormatting?.trim() ?? "",
    });
  }
  return results;
}

/** Search the web, returning results in relevance order. */
export async function search(
  query: string,
  { limit, signal }: SearchOptions = {},
): Promise<SearchResult[]> {
  // A page holds PAGE_SIZE results, so a larger limit costs one request each.
  const pages =
    limit === undefined ? 1 : Math.min(Math.ceil(limit / PAGE_SIZE), MAX_PAGE);

  const results: SearchResult[] = [];
  for (let page = 0; page < pages; page++) {
    results.push(...(await searchPage(query, page * PAGE_SIZE, signal)));
  }
  return limit === undefined ? results : results.slice(0, limit);
}

/** Render results as a numbered Markdown list. */
export function formatSearchResults(results: readonly SearchResult[]): string {
  return results
    .map(({ title, url, snippet }, i) => {
      const number = i + 1;
      const indent = " ".repeat(String(number).length + 2);
      return `${number}. [${title}](${url})\n${indent}${snippet}\n`;
    })
    .join("\n");
}

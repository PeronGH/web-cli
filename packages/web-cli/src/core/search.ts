import { CHROMIUM_HEADERS, type Fetch, type RequestOptions } from "./http.ts";

// Google Custom Search Engine, ported from SearXNG's `google_cse` engine: a CSE
// exposes the regular Google index as JSONP with no API key, so results come
// straight from Google instead of through somebody's SearXNG instance.
// https://github.com/searxng/searxng/blob/master/searx/engines/google_cse.py

const CX = "partner-pub-8993703457585266:4862972284"; // blackle.com
const LIBRARY_URL = `https://cse.google.com/cse/cse.js?cx=${CX}`;
const ENDPOINT = "https://cse.google.com/cse/element/v1";

const PAGE_SIZE = 20;
/** Google stops serving a CSE past six pages, however big the limit. */
const MAX_RESULTS = 120;
const MAX_PAGE = MAX_RESULTS / PAGE_SIZE;
const TOKEN_TTL_MS = 60 * 60 * 1000;

/** A single search result. */
export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

export interface SearchOptions {
  /** Maximum number of results to return. Defaults to 20, capped at 120. */
  limit?: number;
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
async function cseToken(fetch: Fetch, signal?: AbortSignal): Promise<CseToken> {
  if (cachedToken && Date.now() < cachedTokenExpiresAt) return cachedToken;

  const response = await fetch(LIBRARY_URL, {
    headers: { ...CHROMIUM_HEADERS, Accept: "*/*" },
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

/** Google labels the interface by language (`hl`), which follows the host locale. */
function localeParams(): Record<string, string> {
  const [language = "en"] = Intl.DateTimeFormat()
    .resolvedOptions()
    .locale.split("-");
  return { hl: language };
}

async function searchPage(
  query: string,
  start: number,
  token: CseToken,
  fetch: Fetch,
  signal?: AbortSignal,
): Promise<SearchResult[]> {
  const params = new URLSearchParams({
    rsz: "filtered_cse",
    num: String(PAGE_SIZE),
    ...localeParams(),
    cselibv: token.version,
    cx: CX,
    q: query,
    // Explicitly unfiltered: omitting `safe` falls back to whatever the CSE's
    // own control panel is set to, which we neither control nor know.
    safe: "off",
    cse_tok: token.token,
    callback: "_",
    // Empty, but required: dropping `rurl` altogether gets a 403.
    rurl: "",
    searchtype: "",
  });
  if (token.exp) params.set("exp", token.exp);
  if (start) params.set("start", String(start));

  const response = await fetch(`${ENDPOINT}?${params}`, {
    headers: {
      ...CHROMIUM_HEADERS,
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
  { limit = PAGE_SIZE }: SearchOptions = {},
  { fetch = globalThis.fetch, signal }: RequestOptions = {},
): Promise<SearchResult[]> {
  // A page holds PAGE_SIZE results, so a larger limit costs one request each.
  const pages = Math.min(Math.max(Math.ceil(limit / PAGE_SIZE), 0), MAX_PAGE);

  // Pages are independent, so they go out together — the token is minted once
  // up front, since a concurrent mint per page would each need its own request.
  const token = await cseToken(fetch, signal);
  const settled = await Promise.allSettled(
    Array.from({ length: pages }, (_, page) =>
      searchPage(query, page * PAGE_SIZE, token, fetch, signal),
    ),
  );

  // allSettled keeps the pages that answered, in request order so relevance
  // order survives; only a total wipeout is worth reporting as a failure.
  const results: SearchResult[] = [];
  let failure: PromiseRejectedResult | undefined;
  for (const outcome of settled) {
    if (outcome.status === "fulfilled") {
      results.push(...outcome.value);
    } else {
      failure ??= outcome;
    }
  }
  if (results.length === 0 && failure) throw failure.reason;

  return results.slice(0, limit);
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

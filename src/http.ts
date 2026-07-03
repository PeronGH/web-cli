import { proxyBase } from "./build-config.ts" with { type: "macro" };

// Inlined at bundle time. When empty, requests go straight to the target.
const PROXY_BASE = proxyBase();

function proxify(url: string): string {
  return PROXY_BASE === "" ? url : `${PROXY_BASE}/${url}`;
}

function deproxify(url: string): string {
  return PROXY_BASE !== "" && url.startsWith(`${PROXY_BASE}/`)
    ? url.slice(PROXY_BASE.length + 1)
    : url;
}

/** A fetched page. URLs are target URLs; the proxy never appears in one. */
export interface Page {
  /** Final URL after redirects. */
  url: string;
  /** Lowercased Content-Type header, "" when absent. */
  contentType: string;
  body: string;
}

// Browser-like request headers so sites serve their standard server-rendered
// HTML instead of a bot/blocked page. We don't execute JavaScript, so we take
// the page as a plain navigating browser would receive it.
const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
  "Accept-Language": "en-US,en;q=0.9",
  "sec-ch-ua": '"Brave";v="137", "Chromium";v="137", "Not/A)Brand";v="24"',
  "sec-ch-ua-mobile": "?0",
  "sec-ch-ua-platform": '"Windows"',
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "none",
  "Sec-Fetch-User": "?1",
  "Upgrade-Insecure-Requests": "1",
  "Sec-GPC": "1",
};

// Anubis (https://github.com/TecharoHQ/anubis) gates browser-like clients behind
// a JavaScript proof-of-work, but scores any non-"Mozilla" User-Agent as benign
// and lets it straight through. We can't run the PoW, so we retry as curl.
const CURL_HEADERS = {
  "User-Agent": "curl/8.7.1",
  Accept: "*/*",
};

async function fetchOk(url: string, init: RequestInit): Promise<Page> {
  const response = await fetch(proxify(url), { redirect: "follow", ...init });
  if (!response.ok) {
    throw new Error(
      `Failed to fetch ${url}: ${response.status} ${response.statusText}`,
    );
  }
  return {
    url: deproxify(response.url) || url,
    contentType: (response.headers.get("content-type") ?? "").toLowerCase(),
    body: await response.text(),
  };
}

/**
 * Fetch a page with browser-like headers, via the build-time proxy when one
 * is configured. Follows redirects and throws on a non-2xx response.
 */
export async function fetchPage(
  url: string,
  init?: RequestInit,
): Promise<Page> {
  return fetchOk(url, {
    ...init,
    headers: { ...BROWSER_HEADERS, ...init?.headers },
  });
}

/**
 * Fetch a page as curl, replacing the browser headers entirely. Used to slip
 * past Anubis, which only challenges browser-like User-Agents.
 */
export function fetchPageAsCurl(url: string): Promise<Page> {
  return fetchOk(url, { headers: CURL_HEADERS });
}

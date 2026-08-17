import { EnvHttpProxyAgent } from "undici";

// Kitesurf is a stateless headless browser running on Cloudflare Workers: it
// loads the target URL, runs its JavaScript and returns the serialized DOM. Every
// page goes through it, so we get browser-rendered HTML — client-side rendered
// pages included — without spoofing browser headers ourselves, and the response
// is always HTML no matter what the target served.
const KITESURF_HTML = "https://kitesurf.cloudflare.app/html";

// Anubis (https://github.com/TecharoHQ/anubis) gates browser-like clients behind
// a JavaScript proof-of-work, but scores any non-"Mozilla" User-Agent as benign
// and lets it straight through. Retrying as curl is cheaper than solving it.
const CURL_HEADERS = {
  "User-Agent": "curl/8.7.1",
  Accept: "*/*",
};

// Node's fetch ignores HTTP_PROXY / HTTPS_PROXY / NO_PROXY without a dispatcher
// that implements them. We attach one per request instead of installing a global
// dispatcher, so importing this module never changes the host process — it is
// loaded inside pi as well as in our own CLI. Bun honors the proxy environment
// natively and ignores the extra option.
let proxyAgent: EnvHttpProxyAgent | undefined;

/** `fetch` that honors the proxy environment variables. */
export function httpFetch(
  url: string,
  init: RequestInit = {},
): Promise<Response> {
  proxyAgent ??= new EnvHttpProxyAgent();
  return fetch(url, { ...init, dispatcher: proxyAgent } as RequestInit);
}

export interface FetchHtmlOptions extends RequestInit {}

/** Fetch a URL as browser-rendered HTML. Throws when the request is rejected. */
export async function fetchHtml(
  url: string,
  init: FetchHtmlOptions = {},
): Promise<string> {
  const endpoint = `${KITESURF_HTML}?url=${encodeURIComponent(url)}`;
  const response = await httpFetch(endpoint, init);
  if (!response.ok) {
    const detail = (await response.text()).trim();
    throw new Error(`Failed to fetch ${url}: ${response.status} ${detail}`);
  }
  return response.text();
}

/**
 * Fetch a URL directly as curl, bypassing the browser. Used to slip past Anubis,
 * which only challenges browser-like User-Agents.
 */
export async function fetchHtmlAsCurl(
  url: string,
  init: FetchHtmlOptions = {},
): Promise<string> {
  const response = await httpFetch(url, {
    redirect: "follow",
    ...init,
    headers: CURL_HEADERS,
  });
  if (!response.ok) {
    throw new Error(
      `Failed to fetch ${url}: ${response.status} ${response.statusText}`,
    );
  }
  return response.text();
}

import { EnvHttpProxyAgent } from "undici";

// Kitesurf is a stateless headless browser running on Cloudflare Workers: it
// loads the target URL, runs its JavaScript and returns the serialized DOM.
// Rendering through it is opt-in, for pages whose content only exists after
// JavaScript runs; the response is always HTML no matter what the target
// served.
const KITESURF_HTML = "https://kitesurf.cloudflare.app/html";

// Browser-like request headers so sites serve their standard server-rendered
// HTML instead of a bot/blocked page. Direct fetches don't execute JavaScript,
// so they take the page as a plain navigating browser would receive it.
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

// A slow origin otherwise burns Kitesurf's whole 60s wall-clock budget. Capping
// the navigation needs `gotoOptions`, which is POST-only — GET reads just `url`.
// `waitUntil: "networkidle0"` holds the navigation open until network activity
// has settled, so late-loading content is on the page before serialization, and
// `bestAttempt` serializes whatever the page had at the cap instead of failing
// the render outright.
const RENDER_TIMEOUT_MS = 30_000;

// The serialized DOM already carries everything markdown extraction needs —
// structure, text, href/src/alt — so resource bytes never influence the output.
// Blocking them lets `networkidle0` settle sooner and eases Kitesurf's CPU and
// wall-clock budgets. Scripts and the document/data transports that feed them
// (`xhr`, `fetch`) must stay: client-side rendering is the point of rendering,
// and blocking `preflight` would break cross-origin content fetches.
const REJECT_RESOURCE_TYPES = [
  "stylesheet",
  "image",
  "font",
  "media",
  "manifest",
  "texttrack",
  "prefetch",
  "ping",
  "cspviolationreport",
];

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

export interface Page {
  /** Final URL after redirects. */
  url: string;
  /** Lowercased Content-Type header, or an empty string when absent. */
  contentType: string;
  body: string;
}

async function fetchPageWithHeaders(
  url: string,
  headers: NonNullable<RequestInit["headers"]>,
  init: FetchHtmlOptions,
): Promise<Page> {
  const response = await httpFetch(url, {
    redirect: "follow",
    ...init,
    headers,
  });
  if (!response.ok) {
    throw new Error(
      `Failed to fetch ${url}: ${response.status} ${response.statusText}`,
    );
  }
  return {
    url: response.url || url,
    contentType: (response.headers.get("content-type") ?? "").toLowerCase(),
    body: await response.text(),
  };
}

/** Fetch a URL directly with browser navigation headers. */
export function fetchPageDirect(
  url: string,
  init: FetchHtmlOptions = {},
): Promise<Page> {
  const headers = new Headers(BROWSER_HEADERS);
  for (const [name, value] of new Headers(init.headers)) {
    headers.set(name, value);
  }
  return fetchPageWithHeaders(url, headers, init);
}

/** Fetch a URL as browser-rendered HTML. Throws when the request is rejected. */
export async function fetchHtml(
  url: string,
  init: FetchHtmlOptions = {},
): Promise<string> {
  const response = await httpFetch(KITESURF_HTML, {
    ...init,
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      url,
      gotoOptions: { waitUntil: "networkidle0", timeout: RENDER_TIMEOUT_MS },
      rejectResourceTypes: REJECT_RESOURCE_TYPES,
      bestAttempt: true,
    }),
  });
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
export function fetchPageAsCurl(
  url: string,
  init: FetchHtmlOptions = {},
): Promise<Page> {
  return fetchPageWithHeaders(url, CURL_HEADERS, init);
}

export async function fetchHtmlAsCurl(
  url: string,
  init: FetchHtmlOptions = {},
): Promise<string> {
  return (await fetchPageAsCurl(url, init)).body;
}

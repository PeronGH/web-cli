// Browser-like request headers so sites serve their standard server-rendered
// HTML instead of a bot/blocked page. We don't execute JavaScript, so we take
// the page as a plain navigating browser would receive it.
const DEFAULT_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
};

/**
 * Fetch a page with browser-like headers, via the global proxy dispatcher.
 * Follows redirects and throws on a non-2xx response.
 */
export async function fetchPage(
  url: string,
  init?: RequestInit,
): Promise<Response> {
  const response = await fetch(url, {
    redirect: "follow",
    ...init,
    headers: { ...DEFAULT_HEADERS, ...init?.headers },
  });
  if (!response.ok) {
    throw new Error(
      `Failed to fetch ${url}: ${response.status} ${response.statusText}`,
    );
  }
  return response;
}

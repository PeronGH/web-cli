// Some sites serve JavaScript shells to a plain fetch but expose clean,
// machine-readable content at a sibling URL. Rewrite to that source before
// fetching.

type UrlMatcher = (url: URL) => boolean;
type UrlRewrite = (url: URL) => void;

function removeSuffix(value: string, suffix: string): string {
  return value.endsWith(suffix) ? value.slice(0, -suffix.length) : value;
}

const URL_REWRITES: readonly (readonly [UrlMatcher, UrlRewrite])[] = [
  [
    (url) =>
      url.hostname === "developers.cloudflare.com" &&
      !/\.[a-z]+$/.test(url.pathname),
    (url) => {
      url.pathname = url.pathname.endsWith("/")
        ? `${url.pathname}index.md`
        : `${url.pathname}/index.md`;
    },
  ],
  [
    (url) =>
      url.hostname === "developer.apple.com" &&
      url.pathname.startsWith("/documentation/"),
    (url) => {
      url.pathname = `/tutorials/data${removeSuffix(url.pathname, "/").toLowerCase()}.md`;
    },
  ],
  [
    (url) =>
      ["x.com", "www.x.com", "twitter.com", "www.twitter.com"].includes(
        url.hostname,
      ),
    (url) => {
      url.hostname = "nitter.tiekoetter.com";
    },
  ],
];

export function rewriteUrl(url: string): string {
  const parsed = new URL(url);
  for (const [matches, rewrite] of URL_REWRITES) {
    if (matches(parsed)) {
      const rewritten = new URL(parsed);
      rewrite(rewritten);
      return rewritten.toString();
    }
  }
  return url;
}

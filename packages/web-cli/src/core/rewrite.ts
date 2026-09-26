import type { FetchAsMarkdownOptions } from "./fetch.ts";

// Some sites serve JavaScript shells to a plain fetch but expose clean,
// machine-readable content at a sibling URL. Rewrite to that source before
// fetching.

interface UrlRewrite {
  matches: (url: URL) => boolean;
  rewrite: (url: URL) => void;
  /** Options that suit the rewritten source, overriding the caller's. */
  options?: FetchAsMarkdownOptions;
}

function removeSuffix(value: string, suffix: string): string {
  return value.endsWith(suffix) ? value.slice(0, -suffix.length) : value;
}

const URL_REWRITES: readonly UrlRewrite[] = [
  {
    matches: (url) =>
      url.hostname === "developer.apple.com" &&
      url.pathname.startsWith("/documentation/"),
    rewrite: (url) => {
      url.pathname = `/tutorials/data${removeSuffix(url.pathname, "/").toLowerCase()}.md`;
    },
    // The rewritten source is raw Markdown; a browser has nothing to render.
    options: { render: false },
  },
  {
    matches: (url) =>
      ["x.com", "www.x.com", "twitter.com", "www.twitter.com"].includes(
        url.hostname,
      ),
    rewrite: (url) => {
      url.hostname = "nitter.tiekoetter.com";
    },
    // Nitter serves server-rendered HTML, and its Anubis gate only lets the
    // curl retry of a direct fetch through.
    options: { render: false },
  },
  {
    // reddit.com 403s plain fetches; eddrit serves the same paths as clean
    // server-rendered HTML, and its hostname doesn't contain "reddit.com",
    // which would trip Defuddle's reddit extractor.
    matches: (url) => /(^|\.)reddit\.com$/.test(url.hostname),
    rewrite: (url) => {
      url.hostname = "eddrit.com";
    },
    // Same Anubis gate as Nitter.
    options: { render: false },
  },
];

/** A URL rewritten to a better source, with the fetch options that source needs. */
export interface RewrittenUrl {
  url: string;
  /** Options that override the caller's when fetching `url`. */
  options: FetchAsMarkdownOptions;
}

/** Rewrite a URL to a better source, with the fetch options that source needs. */
export function rewriteUrl(url: string): RewrittenUrl {
  const parsed = new URL(url);
  for (const { matches, rewrite, options = {} } of URL_REWRITES) {
    if (matches(parsed)) {
      const rewritten = new URL(parsed);
      rewrite(rewritten);
      return { url: rewritten.toString(), options };
    }
  }
  return { url, options: {} };
}

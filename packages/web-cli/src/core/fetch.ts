import { Defuddle } from "defuddle/node";
import { parseHTML } from "linkedom";
import TurndownService from "turndown";
import { fetchPage, fetchPageAsCurl } from "./http.ts";
import { rewriteUrl } from "./rewrite.ts";

// A missing content type is treated as HTML, matching how browsers sniff pages.
function isHtml(contentType: string): boolean {
  return (
    contentType === "" ||
    contentType.startsWith("text/html") ||
    contentType.startsWith("application/xhtml+xml")
  );
}

// Detect binary content by inspecting the bytes rather than enumerating MIME
// types per language: a NUL byte never occurs in text, and a high density of
// U+FFFD replacement chars means the bytes weren't valid UTF-8 text.
function looksBinary(text: string): boolean {
  if (text.includes("\u0000")) {
    return true;
  }
  let replacements = 0;
  for (const char of text) {
    if (char === "\uFFFD") {
      replacements++;
    }
  }
  return replacements > text.length * 0.1;
}

const SE_QUESTION = /^\/questions\/\d+(\/|$)/;
const GITHUB_ISSUE = /^\/[^/]+\/[^/]+\/issues\/\d+/;

// Stack Exchange hosts share one Q&A engine, so Defuddle mangles their question
// pages identically.
const STACKEXCHANGE_HOSTS = new Set([
  "stackoverflow.com",
  "serverfault.com",
  "superuser.com",
  "askubuntu.com",
  "mathoverflow.net",
  "stackapps.com",
]);

function isStackExchange(hostname: string): boolean {
  return (
    STACKEXCHANGE_HOSTS.has(hostname) || hostname.endsWith(".stackexchange.com")
  );
}

// Hosts and paths where Defuddle is known to mangle the extracted content, so we
// convert the whole page instead.
function defuddleManglesUrl(url: URL): boolean {
  // Defuddle reduces eddrit listings to a bare title and drops comment threads.
  if (url.hostname === "eddrit.com") return true;
  if (isStackExchange(url.hostname) && SE_QUESTION.test(url.pathname))
    return true;
  if (url.hostname === "xdaforums.com" && url.pathname.startsWith("/t/"))
    return true;
  if (url.hostname === "github.com" && GITHUB_ISSUE.test(url.pathname))
    return true;
  return false;
}

function fullPageMarkdown(html: string): string {
  const turndown = new TurndownService();
  turndown.remove(["script", "style"]);
  return turndown.turndown(html);
}

// Anubis serves a proof-of-work interstitial carrying a `<script
// id="anubis_challenge">` payload instead of the page.
function isAnubisChallenge(document: {
  getElementById(id: string): unknown;
}): boolean {
  return document.getElementById("anubis_challenge") !== null;
}

export interface FetchAsMarkdownOptions {
  /** Convert the whole page instead of extracting the main content. */
  raw?: boolean;
  signal?: AbortSignal;
}

/**
 * Fetch a URL and return its content as Markdown. Textual non-HTML content is
 * returned verbatim; binary content throws.
 */
export async function fetchAsMarkdown(
  target: string,
  { raw = false, signal }: FetchAsMarkdownOptions = {},
): Promise<string> {
  const url = rewriteUrl(target);
  const page = await fetchPage(url, { signal });

  // Non-HTML: return textual content (Markdown, source, JSON, ...) verbatim,
  // and reject binary content, which has no useful text representation.
  if (!isHtml(page.contentType)) {
    if (looksBinary(page.body)) {
      throw new Error(
        `Cannot fetch ${url}: content is binary (${page.contentType})`,
      );
    }
    return page.body;
  }

  let { url: finalUrl, body: html } = page;
  let { document } = parseHTML(html);

  // Anubis only challenges browser-like clients; refetch as curl to slip past.
  if (isAnubisChallenge(document)) {
    ({ url: finalUrl, body: html } = await fetchPageAsCurl(url, { signal }));
    ({ document } = parseHTML(html));
  }

  if (raw || defuddleManglesUrl(new URL(finalUrl))) {
    return fullPageMarkdown(html);
  }

  // useAsync: false stops site-specific extractors from fetching third-party
  // sources themselves (e.g. old.reddit.com), which would bypass our headers
  // and mostly get blocked.
  const { title, content, wordCount } = await Defuddle(document, finalUrl, {
    markdown: true,
    includeReplies: true,
    useAsync: false,
  });

  // Defuddle found no main content (e.g. an app shell); fall back to the page.
  if (wordCount === 0) {
    return fullPageMarkdown(html);
  }

  return title ? `# ${title}\n\n${content}` : content;
}

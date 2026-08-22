import { Defuddle } from "defuddle/node";
import { parseHTML } from "linkedom";
import TurndownService from "turndown";
import { fetchHtml, fetchPageAsCurl, fetchPageDirect } from "./http.ts";
import { rewriteUrl } from "./rewrite.ts";

// A missing content type is treated as HTML, matching how browsers sniff pages.
function isHtml(contentType: string): boolean {
  return (
    contentType === "" ||
    contentType.startsWith("text/html") ||
    contentType.startsWith("application/xhtml+xml")
  );
}

// Detect binary content by inspecting the decoded bytes rather than maintaining
// a list of MIME types: NUL never occurs in text, and many replacement chars
// indicate that the response wasn't valid UTF-8.
function looksBinary(text: string): boolean {
  if (text.includes("\u0000")) return true;

  let replacements = 0;
  for (const char of text) {
    if (char === "\uFFFD") replacements++;
  }
  return replacements > text.length * 0.1;
}

// Outer bound on the network work, above Kitesurf's own render cap so a render
// that lands just under it still gets through.
const FETCH_TIMEOUT_MS = 30_000;

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
  /** Fetch the response directly instead of rendering it in a headless browser. */
  direct?: boolean;
  /** Convert the whole page instead of extracting the main content. */
  raw?: boolean;
  signal?: AbortSignal;
}

/** Fetch a URL and return its content as Markdown. */
export async function fetchAsMarkdown(
  target: string,
  { direct = false, raw = false, signal }: FetchAsMarkdownOptions = {},
): Promise<string> {
  const url = rewriteUrl(target);
  // One deadline for the whole fetch: the Anubis retry is a second round trip
  // and must not get a fresh budget.
  const deadline = AbortSignal.any([
    AbortSignal.timeout(FETCH_TIMEOUT_MS),
    ...(signal ? [signal] : []),
  ]);

  let finalUrl = url;
  let html: string;
  if (direct) {
    const page = await fetchPageDirect(url, { signal: deadline });
    if (!isHtml(page.contentType)) {
      if (looksBinary(page.body)) {
        throw new Error(
          `Cannot fetch ${url}: content is binary (${page.contentType})`,
        );
      }
      return page.body;
    }
    finalUrl = page.url;
    html = page.body;
  } else {
    html = await fetchHtml(url, { signal: deadline });
  }

  let { document } = parseHTML(html);

  // Anubis only challenges browser-like clients; refetch as curl to slip past.
  if (isAnubisChallenge(document)) {
    const page = await fetchPageAsCurl(url, { signal: deadline });
    finalUrl = page.url;
    html = page.body;
    ({ document } = parseHTML(html));
  }

  // Non-HTML targets come back through the browser's plaintext viewer. Return the
  // text itself: converting it would escape every backtick in the source.
  const plaintext = direct
    ? null
    : document.querySelector("body > pre:only-child");
  if (plaintext) {
    return plaintext.textContent ?? "";
  }

  if (raw || defuddleManglesUrl(new URL(finalUrl))) {
    return fullPageMarkdown(html);
  }

  // useAsync: false stops site-specific extractors from fetching third-party
  // sources themselves (e.g. old.reddit.com), which would otherwise make a
  // separate unconfigured request.
  let extracted: Awaited<ReturnType<typeof Defuddle>>;
  try {
    extracted = await Defuddle(document, finalUrl, {
      markdown: true,
      includeReplies: true,
      useAsync: false,
    });
  } catch {
    // Extractors throw on markup they don't expect; the whole page still works.
    return fullPageMarkdown(html);
  }

  const { title, content, wordCount } = extracted;

  // Defuddle found no main content (e.g. an app shell); fall back to the page.
  if (wordCount === 0) {
    return fullPageMarkdown(html);
  }

  return title ? `# ${title}\n\n${content}` : content;
}

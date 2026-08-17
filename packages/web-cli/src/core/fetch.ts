import { Defuddle } from "defuddle/node";
import { parseHTML } from "linkedom";
import TurndownService from "turndown";
import { fetchHtml, fetchHtmlAsCurl } from "./http.ts";
import { rewriteUrl } from "./rewrite.ts";

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

/** Fetch a URL and return its content as Markdown. */
export async function fetchAsMarkdown(
  target: string,
  { raw = false, signal }: FetchAsMarkdownOptions = {},
): Promise<string> {
  const url = rewriteUrl(target);
  let html = await fetchHtml(url, { signal });
  let { document } = parseHTML(html);

  // Anubis only challenges browser-like clients; refetch as curl to slip past.
  if (isAnubisChallenge(document)) {
    html = await fetchHtmlAsCurl(url, { signal });
    ({ document } = parseHTML(html));
  }

  if (raw || defuddleManglesUrl(new URL(url))) {
    return fullPageMarkdown(html);
  }

  // useAsync: false stops site-specific extractors from fetching third-party
  // sources themselves (e.g. old.reddit.com), which would bypass the browser and
  // mostly get blocked.
  let extracted: Awaited<ReturnType<typeof Defuddle>>;
  try {
    extracted = await Defuddle(document, url, {
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

import { defineCommand } from "citty";
import { Defuddle } from "defuddle/node";
import { parseHTML } from "linkedom";
import TurndownService from "turndown";
import { fetchPage, fetchPageAsCurl } from "../http.ts";
import { rewriteUrl } from "../rewrite.ts";

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

const REDDIT_LISTING = /^\/(r|u|user)\/[^/]+(\/[^/]+)?\/?$/;
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
  if (
    /(^|\.)reddit\.com$/.test(url.hostname) &&
    REDDIT_LISTING.test(url.pathname)
  )
    return true;
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

export const fetchCommand = defineCommand({
  meta: {
    name: "fetch",
    description: "Fetch a URL and print its main content as Markdown",
  },
  args: {
    url: {
      type: "positional",
      description: "The URL to fetch",
      required: true,
    },
    raw: {
      type: "boolean",
      description:
        "Convert the whole page to Markdown without extracting the main content",
      default: false,
    },
  },
  async run({ args }) {
    const url = rewriteUrl(args.url);
    const response = await fetchPage(url);
    const contentType = (
      response.headers.get("content-type") ?? ""
    ).toLowerCase();

    // Non-HTML: print textual content (Markdown, source, JSON, ...) verbatim,
    // and reject binary content, which has no useful text representation.
    if (!isHtml(contentType)) {
      const text = await response.text();
      if (looksBinary(text)) {
        throw new Error(
          `Cannot fetch ${url}: content is binary (${contentType})`,
        );
      }
      console.log(text);
      return;
    }

    let finalUrl = response.url || url;
    let html = await response.text();
    let { document } = parseHTML(html);

    // Anubis only challenges browser-like clients; refetch as curl to slip past.
    if (isAnubisChallenge(document)) {
      const retry = await fetchPageAsCurl(url);
      finalUrl = retry.url || finalUrl;
      html = await retry.text();
      ({ document } = parseHTML(html));
    }

    if (args.raw || defuddleManglesUrl(new URL(finalUrl))) {
      console.log(fullPageMarkdown(html));
      return;
    }

    const { title, content, wordCount } = await Defuddle(document, finalUrl, {
      markdown: true,
      includeReplies: true,
    });

    // Defuddle found no main content (e.g. an app shell); fall back to the page.
    if (wordCount === 0) {
      console.log(fullPageMarkdown(html));
      return;
    }

    if (title) {
      console.log(`# ${title}\n`);
    }
    console.log(content);
  },
});

import { Defuddle } from "defuddle/node";
import { parseHTML } from "linkedom";
import TurndownService from "turndown";

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

async function mainContentMarkdown(html: string, url: string): Promise<string> {
  const { document } = parseHTML(html);
  // useAsync: false stops site-specific extractors from fetching third-party
  // sources themselves (e.g. old.reddit.com), which would otherwise make a
  // separate unconfigured request.
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

/**
 * The built-in HTML converter: extracts the main content with Defuddle, or
 * converts the whole page with Turndown when `raw` is set.
 */
export async function htmlToMarkdown(
  html: string,
  { url, raw = false }: { url: string; raw?: boolean },
): Promise<string> {
  return raw || defuddleManglesUrl(new URL(url))
    ? fullPageMarkdown(html)
    : mainContentMarkdown(html, url);
}

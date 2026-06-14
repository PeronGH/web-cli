import { defineCommand } from "citty";
import { Defuddle } from "defuddle/node";
import { parseHTML } from "linkedom";
import TurndownService from "turndown";
import { fetchPage } from "../http.ts";

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
    const response = await fetchPage(args.url);
    const contentType = (
      response.headers.get("content-type") ?? ""
    ).toLowerCase();

    // Non-HTML: print textual content (Markdown, source, JSON, ...) verbatim,
    // and reject binary content, which has no useful text representation.
    if (!isHtml(contentType)) {
      const text = await response.text();
      if (looksBinary(text)) {
        throw new Error(
          `Cannot fetch ${args.url}: content is binary (${contentType})`,
        );
      }
      console.log(text);
      return;
    }

    const html = await response.text();

    if (args.raw) {
      const turndown = new TurndownService();
      turndown.remove(["script", "style"]);
      console.log(turndown.turndown(html));
      return;
    }

    const { document } = parseHTML(html);
    const { title, content } = await Defuddle(document, args.url, {
      markdown: true,
    });

    if (title) {
      console.log(`# ${title}\n`);
    }
    console.log(content);
  },
});

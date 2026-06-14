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

const TEXT_TYPE_RE =
  /^application\/(json|xml|javascript|ecmascript|yaml|x-yaml|x-sh|.*\+json|.*\+xml)/;

function isText(contentType: string): boolean {
  return contentType.startsWith("text/") || TEXT_TYPE_RE.test(contentType);
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

    // Already-textual content (Markdown, source code, JSON, plain text) is
    // printed verbatim; binary content has no useful text representation.
    if (!isHtml(contentType)) {
      if (!isText(contentType)) {
        throw new Error(
          `Cannot fetch ${args.url}: unsupported content type "${contentType}"`,
        );
      }
      console.log(await response.text());
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

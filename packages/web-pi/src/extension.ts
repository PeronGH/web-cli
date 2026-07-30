import {
  DEFAULT_MAX_BYTES,
  DEFAULT_MAX_LINES,
  type ExtensionAPI,
  formatSize,
  truncateHead,
} from "@earendil-works/pi-coding-agent";
import {
  fetchAsMarkdown,
  formatSearchResults,
  search,
} from "@peron_js/web-cli";
import { Type } from "typebox";

function truncate(text: string): string {
  const result = truncateHead(text, {
    maxLines: DEFAULT_MAX_LINES,
    maxBytes: DEFAULT_MAX_BYTES,
  });
  if (!result.truncated) return result.content;
  return `${result.content}\n\n[Output truncated: ${result.outputLines} of ${result.totalLines} lines (${formatSize(result.outputBytes)} of ${formatSize(result.totalBytes)}).]`;
}

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "web_search",
    label: "Web Search",
    description:
      "Search the web. Returns a numbered Markdown list of results with title, URL, and snippet.",
    promptSnippet: "Search the web for a query",
    promptGuidelines: [
      "Use web_search to check anything that may be outdated or uncertain, then read the promising results with web_fetch.",
    ],
    parameters: Type.Object({
      query: Type.String({ description: "The search query" }),
      limit: Type.Optional(
        Type.Integer({
          minimum: 1,
          description: "Maximum number of results to return",
        }),
      ),
    }),
    async execute(_toolCallId, params, signal) {
      const results = await search(params.query, {
        limit: params.limit,
        signal,
      });
      return {
        content: [
          {
            type: "text",
            text:
              results.length === 0
                ? `No results found for: ${params.query}`
                : formatSearchResults(results),
          },
        ],
        details: { results },
      };
    },
  });

  pi.registerTool({
    name: "web_fetch",
    label: "Web Fetch",
    description:
      "Fetch a URL and return its main content as Markdown. Textual non-HTML content is returned verbatim; binary content is rejected. Output is truncated to 2000 lines or 50KB.",
    promptSnippet: "Fetch a URL and read its content as Markdown",
    promptGuidelines: [
      "Use web_fetch instead of curl to read a web page, because it returns readable Markdown instead of raw HTML.",
    ],
    parameters: Type.Object({
      url: Type.String({ description: "The URL to fetch" }),
      raw: Type.Optional(
        Type.Boolean({
          description:
            "Convert the whole page instead of extracting the main content",
        }),
      ),
    }),
    async execute(_toolCallId, params, signal) {
      const markdown = await fetchAsMarkdown(params.url, {
        raw: params.raw,
        signal,
      });
      return {
        content: [{ type: "text", text: truncate(markdown) }],
        details: { url: params.url },
      };
    },
  });
}

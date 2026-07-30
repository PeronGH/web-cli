import { defineTool } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import {
  formatSearchResults,
  type SearchResult,
  search,
} from "@peron_js/web-cli";
import { Type } from "typebox";
import { expandHint, resultText } from "./render.ts";

const Params = Type.Object({
  query: Type.String({ description: "The search query" }),
  limit: Type.Optional(
    Type.Integer({
      minimum: 1,
      description: "Maximum number of results to return",
    }),
  ),
});

interface SearchDetails {
  results: SearchResult[];
}

export const webSearchTool = defineTool<typeof Params, SearchDetails>({
  name: "web_search",
  label: "Web Search",
  description:
    "Search the web. Returns a numbered Markdown list of results with title, URL, and snippet.",
  promptSnippet: "Search the web for a query",
  promptGuidelines: [
    "Use web_search to check anything that may be outdated or uncertain, then read the promising results with web_fetch.",
  ],
  parameters: Params,

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

  renderCall(args, theme) {
    let text = theme.fg("toolTitle", theme.bold("web_search "));
    text += theme.fg("accent", args.query);
    if (args.limit !== undefined) {
      text += theme.fg("dim", ` (max ${args.limit})`);
    }
    return new Text(text, 0, 0);
  },

  renderResult(result, { expanded, isPartial }, theme, context) {
    if (isPartial) return new Text(theme.fg("muted", "Searching…"), 0, 0);
    if (context.isError) {
      return new Text(theme.fg("error", resultText(result)), 0, 0);
    }

    const { results } = result.details;
    if (results.length === 0) {
      return new Text(theme.fg("dim", "No results"), 0, 0);
    }

    let text = theme.fg(
      "success",
      `${results.length} result${results.length === 1 ? "" : "s"}`,
    );
    if (!expanded) return new Text(text + expandHint(theme), 0, 0);

    // Titles and URLs only; the snippets are what make the raw output unreadable.
    for (const [index, { title, url }] of results.entries()) {
      text += `\n${theme.fg("muted", `${index + 1}.`)} ${title}`;
      text += `\n   ${theme.fg("mdLinkUrl", url)}`;
    }
    return new Text(text, 0, 0);
  },
});

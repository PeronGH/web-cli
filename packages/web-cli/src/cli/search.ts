import { defineCommand } from "citty";
import { formatSearchResults, search } from "../core/search.ts";
import { proxyFetch } from "./proxy.ts";

function parsePages(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const pages = Number(value);
  if (!Number.isInteger(pages) || pages < 1 || pages > 6) {
    throw new Error(`--pages must be an integer from 1 to 6, got ${value}`);
  }
  return pages;
}

export const searchCommand = defineCommand({
  meta: {
    name: "search",
    description: "Search the web for a query",
  },
  args: {
    query: {
      type: "positional",
      description: "The search query",
      required: true,
    },
    pages: {
      type: "string",
      description: "Pages of 20 results to fetch, 1 to 6 (default 1)",
    },
  },
  async run({ args }) {
    const results = await search(
      args.query,
      { pages: parsePages(args.pages) },
      { fetch: proxyFetch },
    );
    if (results.length === 0) {
      console.error("No results found.");
      return;
    }
    console.log(formatSearchResults(results));
  },
});

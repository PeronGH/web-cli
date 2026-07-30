import { defineCommand } from "citty";
import { formatSearchResults, search } from "../core/search.ts";

function parseLimit(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const limit = Number.parseInt(value, 10);
  if (!Number.isFinite(limit) || limit < 0) {
    throw new Error(`--limit must be a non-negative integer, got ${value}`);
  }
  return limit;
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
    limit: {
      type: "string",
      description: "Maximum number of results to print",
    },
  },
  async run({ args }) {
    const results = await search(args.query, { limit: parseLimit(args.limit) });
    if (results.length === 0) {
      console.error("No results found.");
      return;
    }
    console.log(formatSearchResults(results));
  },
});

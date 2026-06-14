import { defineCommand } from "citty";

export const search = defineCommand({
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
  },
  run({ args }) {
    // TODO: implement web search
    console.log(`[stub] searching the web for: ${args.query}`);
  },
});

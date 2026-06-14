import { defineCommand } from "citty";

export const fetch = defineCommand({
  meta: {
    name: "fetch",
    description: "Fetch the contents of a URL",
  },
  args: {
    url: {
      type: "positional",
      description: "The URL to fetch",
      required: true,
    },
  },
  run({ args }) {
    // TODO: implement web fetch
    console.log(`[stub] fetching: ${args.url}`);
  },
});

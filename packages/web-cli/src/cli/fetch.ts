import { defineCommand } from "citty";
import { fetchAsMarkdown } from "../core/fetch.ts";

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
    direct: {
      type: "boolean",
      description: "Fetch directly without the headless browser",
      default: false,
    },
    raw: {
      type: "boolean",
      description:
        "Convert the whole page to Markdown without extracting the main content",
      default: false,
    },
  },
  async run({ args }) {
    console.log(
      await fetchAsMarkdown(args.url, {
        direct: args.direct,
        raw: args.raw,
      }),
    );
  },
});

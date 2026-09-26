import { defineCommand } from "citty";
import { fetchAsMarkdown } from "../core/fetch.ts";
import { proxyFetch } from "./proxy.ts";

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
    render: {
      type: "boolean",
      description: "Render the page in a headless browser (slow)",
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
      await fetchAsMarkdown(
        args.url,
        { render: args.render, raw: args.raw },
        { fetch: proxyFetch },
      ),
    );
  },
});

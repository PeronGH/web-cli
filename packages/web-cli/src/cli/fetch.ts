import { defineCommand } from "citty";
import { fetchContent } from "../core/fetch.ts";
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
    const content = await fetchContent(
      args.url,
      { render: args.render, raw: args.raw },
      { fetch: proxyFetch },
    );
    if (content.type === "image") {
      throw new Error(
        `Cannot print ${args.url}: content is an image (${content.mimeType})`,
      );
    }
    console.log(content.text);
  },
});

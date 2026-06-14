import { defineCommand } from "citty";
import { Defuddle } from "defuddle/node";
import { parseHTML } from "linkedom";
import { fetchPage } from "../http.ts";

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
  },
  async run({ args }) {
    const response = await fetchPage(args.url);
    if (!response.ok) {
      throw new Error(
        `Failed to fetch ${args.url}: ${response.status} ${response.statusText}`,
      );
    }

    const { document } = parseHTML(await response.text());
    const { title, content } = await Defuddle(document, args.url, {
      markdown: true,
    });

    if (title) {
      console.log(`# ${title}\n`);
    }
    console.log(content);
  },
});

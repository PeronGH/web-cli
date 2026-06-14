import { defineCommand } from "citty";
import { Defuddle } from "defuddle/node";
import { parseHTML } from "linkedom";
import TurndownService from "turndown";
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
    raw: {
      type: "boolean",
      description:
        "Convert the whole page to Markdown without extracting the main content",
      default: false,
    },
  },
  async run({ args }) {
    const response = await fetchPage(args.url);
    const html = await response.text();

    if (args.raw) {
      const turndown = new TurndownService();
      turndown.remove(["script", "style"]);
      console.log(turndown.turndown(html));
      return;
    }

    const { document } = parseHTML(html);
    const { title, content } = await Defuddle(document, args.url, {
      markdown: true,
    });

    if (title) {
      console.log(`# ${title}\n`);
    }
    console.log(content);
  },
});

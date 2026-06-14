import { defineCommand } from "citty";
import { parseHTML } from "linkedom";
import { fetchPage } from "../http.ts";

type SearchResult = {
  title: string;
  url: string;
  snippet: string;
};

/** Structural type for the linkedom nodes we touch. */
type SearchEl = {
  querySelector(selector: string): {
    textContent: string | null;
    getAttribute(name: string): string | null;
  } | null;
};

const DIRECT_BASE = "https://search.brave.com";
const PROXY_BASE = "https://brave-proxy.banned.workers.dev";

async function search(query: string, direct: boolean): Promise<SearchResult[]> {
  const params = new URLSearchParams({
    q: query,
    source: "web",
    safesearch: "off",
    summary: "0",
  });
  const base = direct ? DIRECT_BASE : PROXY_BASE;
  const response = await fetchPage(`${base}/search?${params}`, {
    headers: {
      Referer: "https://search.brave.com/",
      "Sec-Fetch-Site": "same-origin",
    },
  });
  const { document } = parseHTML(await response.text());

  return Array.from(
    document.querySelectorAll('div.snippet[data-type="web"]'),
    (item: SearchEl) => ({
      title:
        item.querySelector(".search-snippet-title")?.textContent?.trim() ?? "",
      url: item.querySelector("a.l1")?.getAttribute("href") ?? "",
      snippet:
        item.querySelector(".generic-snippet")?.textContent?.trim() ?? "",
    }),
  );
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
    direct: {
      type: "boolean",
      description: "Query search.brave.com directly instead of via the proxy",
      default: false,
    },
  },
  async run({ args }) {
    const results = await search(args.query, args.direct);
    if (results.length === 0) {
      console.error("No results found.");
      return;
    }
    results.forEach(({ title, url, snippet }, i) => {
      console.log(`${i + 1}. ${title}\n   ${url}\n   ${snippet}\n`);
    });
  },
});

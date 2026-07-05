import { defineCommand } from "citty";

type SearchResult = {
  title: string;
  url: string;
  snippet: string;
};

const SEARX_INSTANCE = "https://search.banned.dynv6.net";

async function search(query: string): Promise<SearchResult[]> {
  const params = new URLSearchParams({ q: query, format: "json" });
  const response = await fetch(`${SEARX_INSTANCE}/search?${params}`, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(
      `Search request failed: ${response.status} ${response.statusText}`,
    );
  }
  const { results } = (await response.json()) as {
    results: { title?: string; url?: string; content?: string }[];
  };
  return results.map(({ title, url, content }) => ({
    title: title?.trim() ?? "",
    url: url?.trim() ?? "",
    snippet: content?.trim() ?? "",
  }));
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
  },
  async run({ args }) {
    const results = await search(args.query);
    if (results.length === 0) {
      console.error("No results found.");
      return;
    }
    results.forEach(({ title, url, snippet }, i) => {
      console.log(`${i + 1}. ${title}\n   ${url}\n   ${snippet}\n`);
    });
  },
});

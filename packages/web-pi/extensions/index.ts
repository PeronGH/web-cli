import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { webFetchTool } from "../src/fetch.ts";
import { webSearchTool } from "../src/search.ts";

export default function (pi: ExtensionAPI) {
  pi.registerTool(webSearchTool);
  pi.registerTool(webFetchTool);
}

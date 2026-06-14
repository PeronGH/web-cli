#!/usr/bin/env node
import { defineCommand, runMain } from "citty";
import { EnvHttpProxyAgent, setGlobalDispatcher } from "undici";
import { description, name, version } from "../package.json";
import { fetchCommand } from "./commands/fetch.ts";
import { searchCommand } from "./commands/search.ts";

// Route fetch through HTTP_PROXY / HTTPS_PROXY, honoring NO_PROXY.
setGlobalDispatcher(new EnvHttpProxyAgent());

export const main = defineCommand({
  meta: { name, version, description },
  subCommands: { search: searchCommand, fetch: fetchCommand },
});

runMain(main);

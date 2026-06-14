#!/usr/bin/env node
import { defineCommand, runMain } from "citty";
import { description, name, version } from "../package.json";
import { fetch } from "./commands/fetch.ts";
import { search } from "./commands/search.ts";

export const main = defineCommand({
  meta: { name, version, description },
  subCommands: { search, fetch },
});

runMain(main);

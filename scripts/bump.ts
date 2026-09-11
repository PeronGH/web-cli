import { $ } from "bun";
import { applyEdits, modify } from "jsonc-parser";

const version = process.argv[2] ?? "patch";
const manifests = Array.from(
  new Bun.Glob("packages/*/package.json").scanSync(),
).sort();
const lockfile = Bun.file("bun.lock");
let lock = await lockfile.text();

for (const path of manifests) {
  const directory = path.slice(0, -"/package.json".length);
  await $`bun pm version ${version} --no-git-tag-version`.cwd(directory);
  const manifest = await Bun.file(path).json();
  lock = applyEdits(
    lock,
    modify(lock, ["workspaces", directory, "version"], manifest.version, {}),
  );
}

await Bun.write(lockfile, lock);

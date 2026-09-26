import { cp, mkdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const output = path.join(root, ".poc", "site-source");
// Only the built frontend and small Worker are sent to the Site's OWN repository.
// No parent Git history, API source, database data, .env, or customer files.
await readFile(path.join(root, "artifacts/shop-app/dist/public/index.html"));
await mkdir(output, { recursive: true });
// Copying over the previous bundle leaves obsolete JS directly retrievable.
// Remove only generated output, after checking its resolved workspace location.
const canonicalRoot = await realpath(root);
const canonicalOutput = await realpath(output);
if (path.relative(canonicalRoot, canonicalOutput) !== path.join(".poc", "site-source")) {
  throw new Error("Unexpected Site checkout location");
}
for (const name of ["frontend", "dist"]) {
  const target = path.join(canonicalOutput, name);
  const resolved = await realpath(target).catch(error => {
    if (error.code === "ENOENT") return target;
    throw error;
  });
  if (path.relative(canonicalOutput, resolved) !== name) throw new Error("Unexpected generated directory");
  await rm(target, { recursive: true, force: true });
}
await mkdir(path.join(output, ".openai"), { recursive: true });
await cp(path.join(root, ".openai/hosting.json"), path.join(output, ".openai/hosting.json"));
await cp(path.join(root, "artifacts/shop-app/dist/public"), path.join(output, "frontend"), { recursive: true });
await cp(path.join(root, "sites/worker.mjs"), path.join(output, "worker.mjs"));
await writeFile(path.join(output, "package.json"), JSON.stringify({ name: "pika-private-poc-site", private: true, type: "module", scripts: { build: "node build.mjs" } }, null, 2) + "\n");
await writeFile(path.join(output, ".gitignore"), "node_modules/\ndist/\n.env*\n");
await writeFile(path.join(output, "build.mjs"), [
  'import { cp, mkdir, rm } from "node:fs/promises";',
  'await rm("dist", { recursive: true, force: true });',
  'await mkdir("dist/server", { recursive: true });',
  'await cp("frontend", "dist/client", { recursive: true });',
  'await cp("worker.mjs", "dist/server/index.js");',
].join("\n") + "\n");
console.log(JSON.stringify({ checkout: output, status: "prepared-locally-not-published" }));

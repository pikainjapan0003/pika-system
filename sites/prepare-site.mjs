import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const output = path.join(root, ".poc", "site-source");
// Only the built frontend and small Worker are sent to the Site's OWN repository.
// No parent Git history, API source, database data, .env, or customer files.
await readFile(path.join(root, "artifacts/shop-app/dist/public/index.html"));
await mkdir(output, { recursive: true });
await mkdir(path.join(output, ".openai"), { recursive: true });
await cp(path.join(root, ".openai/hosting.json"), path.join(output, ".openai/hosting.json"));
await cp(path.join(root, "artifacts/shop-app/dist/public"), path.join(output, "frontend"), { recursive: true });
await cp(path.join(root, "sites/worker.mjs"), path.join(output, "worker.mjs"));
await writeFile(path.join(output, "package.json"), JSON.stringify({ name: "pika-private-poc-site", private: true, type: "module", scripts: { build: "node build.mjs" } }, null, 2) + "\n");
await writeFile(path.join(output, ".gitignore"), "node_modules/\ndist/\n.env*\n");
await writeFile(path.join(output, "build.mjs"), [
  'import { cp, mkdir } from "node:fs/promises";',
  'await mkdir("dist/server", { recursive: true });',
  'await cp("frontend", "dist/client", { recursive: true });',
  'await cp("worker.mjs", "dist/server/index.js");',
].join("\n") + "\n");
console.log(JSON.stringify({ checkout: output, status: "prepared-locally-not-published" }));

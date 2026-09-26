import { cp, mkdir, mkdtemp, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
await mkdir(path.join(root, ".poc"), { recursive: true });
const output = await mkdtemp(path.join(root, ".poc/api-source-"));
const excluded = new Set(["node_modules", "dist", ".git", ".poc"]);
const filter = source => !path.relative(root, source).split(path.sep).some(part =>
  excluded.has(part) || part.startsWith(".env") || part.endsWith(".tsbuildinfo"));

// A small clean source directory works for both Docker and local-source upload.
// Never upload the working tree, local keys, node_modules junctions or Git history.
for (const file of ["package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml", ".npmrc",
  ...(await readdir(root)).filter(name => /^tsconfig.*\.json$/.test(name)),
  "artifacts/api-server", "lib"]) {
  await cp(path.join(root, file), path.join(output, file), { recursive: true, filter });
}
await cp(path.join(root, "sites/poc/Dockerfile"), path.join(output, "Dockerfile"));
await cp(path.join(root, "sites/poc/Dockerfile.dockerignore"), path.join(output, ".dockerignore"));
console.log(JSON.stringify({ sourceDirectory: output }));

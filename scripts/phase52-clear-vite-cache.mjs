import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const targets = [
  "client/node_modules/.vite",
  "client/node_modules/.vite-temp",
  "node_modules/.vite",
  "node_modules/.vite-temp",
].map((relative) => path.join(root, relative));

let removed = 0;
for (const target of targets) {
  if (!fs.existsSync(target)) continue;
  fs.rmSync(target, { recursive: true, force: true });
  removed += 1;
  console.log(`PASS  removed stale Vite dependency cache · ${path.relative(root, target).replaceAll("\\", "/")}`);
}
if (!removed) console.log("PASS  no stale Vite dependency cache found");

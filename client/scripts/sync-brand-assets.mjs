import { copyFile, mkdir, access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const clientRoot = path.resolve(here, "..");
const sourceDir = path.join(clientRoot, "src", "assets");
const targetDir = path.join(clientRoot, "public", "brand");
const assets = ["riseora-logo-Horizontal.png", "riseora-Logo-Vertical.png"];

await mkdir(targetDir, { recursive: true });
for (const name of assets) {
  const source = path.join(sourceDir, name);
  const target = path.join(targetDir, name);
  try {
    await access(source);
    await copyFile(source, target);
    console.log(`[brand] synced ${name}`);
  } catch {
    console.warn(`[brand] ${name} not found in client/src/assets; storefront will use text fallback until it is added or configured from Admin.`);
  }
}

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distIndexPath = path.join(root, "dist", "index.html");
const slugsPath = path.join(root, "src", "generated", "post-slugs.json");

const slugs = JSON.parse(await fs.readFile(slugsPath, "utf8"));
const indexHtml = await fs.readFile(distIndexPath, "utf8");

await Promise.all(
  slugs.map(async (slug) => {
    const routeDir = path.join(root, "dist", "posts", slug);
    await fs.mkdir(routeDir, { recursive: true });
    await fs.writeFile(path.join(routeDir, "index.html"), indexHtml);
  }),
);

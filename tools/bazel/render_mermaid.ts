import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { collectMermaidDiagrams, renderMermaidManifest } from "../mermaid/render_manifest.ts";

const outputDir = process.argv[2] ? await resolveOutputDir(process.argv[2]) : "";

if (!outputDir) {
  throw new Error("Usage: render_mermaid.ts <output-dir>");
}

const packageRoot = await findPackageRoot();
const postsDir = path.join(packageRoot, "posts");
const files = await collectMarkdownFiles(postsDir);
const diagrams = new Map<string, string>();

for (const filePath of files) {
  const raw = await fs.readFile(filePath, "utf8");
  for (const [hash, source] of collectMermaidDiagrams(raw)) {
    diagrams.set(hash, source);
  }
}

await renderMermaidManifest({ outputDir, sources: diagrams });

async function collectMarkdownFiles(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const nestedFiles = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        return collectMarkdownFiles(entryPath);
      }

      if (!entry.name.endsWith(".md") || entry.name.toLowerCase() === "readme.md") {
        return [];
      }

      return [entryPath];
    }),
  );

  return nestedFiles.flat();
}

async function findPackageRoot(): Promise<string> {
  const candidates = [
    process.cwd(),
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", ".."),
  ];

  for (const candidate of candidates) {
    const root = await walkUpFor(candidate, "package.json");
    if (root) {
      return root;
    }
  }

  throw new Error("Could not locate package.json for Mermaid inputs.");
}

async function resolveOutputDir(outputPath: string): Promise<string> {
  if (path.isAbsolute(outputPath)) {
    return outputPath;
  }

  if (!outputPath.startsWith("bazel-out/")) {
    return path.resolve(outputPath);
  }

  const execroot = await walkUpFor(process.cwd(), "bazel-out");
  if (!execroot) {
    return path.resolve(outputPath);
  }

  return path.join(execroot, outputPath);
}

async function walkUpFor(start: string, marker: string): Promise<string> {
  let current = path.resolve(start);

  while (true) {
    try {
      await fs.access(path.join(current, marker));
      return current;
    } catch {
      const parent = path.dirname(current);
      if (parent === current) {
        return "";
      }
      current = parent;
    }
  }
}

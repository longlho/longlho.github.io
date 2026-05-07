import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import matter from "gray-matter";
import { marked } from "marked";
import { build as viteBuild } from "vite";

const outputDir = process.argv[2] ? await resolveOutputDir(process.argv[2]) : "";

if (!outputDir) {
  throw new Error("Usage: build_site.mjs <output-dir>");
}

const packageRoot = await findPackageRoot();
const workspaceDir = await fs.mkdtemp(path.join(os.tmpdir(), "site-build-"));
const buildOutputDir = path.join(workspaceDir, "dist");
const generatedDir = path.join(workspaceDir, "src", "generated");

marked.use({
  gfm: true,
  renderer: {
    code(token) {
      if (token.lang === "mermaid") {
        return `<div class="mermaid">${escapeHtml(token.text)}</div>`;
      }

      return false;
    },
  },
});

await copyTree(packageRoot, workspaceDir, {
  exclude: new Set([
    ".git",
    "bazel-bin",
    "bazel-longlho_github_io",
    "bazel-out",
    "bazel-testlogs",
    "dist",
    "node_modules",
  ]),
});

await fs.rm(generatedDir, { force: true, recursive: true });
await fs.mkdir(generatedDir, { recursive: true });
await renderPosts(path.join(workspaceDir, "posts"), generatedDir);
await linkNodeModules(packageRoot, workspaceDir);

const previousCwd = process.cwd();
process.chdir(workspaceDir);
try {
  await viteBuild({
    base: "/",
    configFile: false,
    root: ".",
    build: {
      emptyOutDir: true,
      outDir: "dist",
    },
  });
} finally {
  process.chdir(previousCwd);
}

await prerenderRoutes(
  path.join(buildOutputDir, "index.html"),
  path.join(generatedDir, "post-slugs.json"),
  path.join(buildOutputDir, "posts"),
);
await fs.rm(outputDir, { force: true, recursive: true });
await copyTree(buildOutputDir, outputDir, { exclude: new Set() });

async function findPackageRoot() {
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

  throw new Error("Could not locate package.json for site build inputs.");
}

async function resolveOutputDir(outputPath) {
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

async function walkUpFor(start, marker) {
  let current = path.resolve(start);

  while (true) {
    if (await fileExists(path.join(current, marker))) {
      return current;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      return "";
    }
    current = parent;
  }
}

async function copyTree(source, destination, { exclude }) {
  await fs.mkdir(destination, { recursive: true });

  for (const entry of await fs.readdir(source, { withFileTypes: true })) {
    if (exclude.has(entry.name) || entry.name.startsWith("bazel-")) {
      continue;
    }

    const sourcePath = path.join(source, entry.name);
    const destinationPath = path.join(destination, entry.name);

    if (entry.isDirectory()) {
      await copyTree(sourcePath, destinationPath, { exclude });
    } else if (entry.isSymbolicLink()) {
      await copySymlinkTarget(sourcePath, destinationPath, { exclude });
    } else if (entry.isFile()) {
      await fs.copyFile(sourcePath, destinationPath);
    }
  }
}

async function copySymlinkTarget(sourcePath, destinationPath, { exclude }) {
  const realPath = await fs.realpath(sourcePath);
  const targetStat = await fs.stat(realPath);

  if (targetStat.isDirectory()) {
    await copyTree(realPath, destinationPath, { exclude });
  } else if (targetStat.isFile()) {
    await fs.copyFile(realPath, destinationPath);
  }
}

async function linkNodeModules(sourceRoot, destinationRoot) {
  const nodeModulesPath = path.join(sourceRoot, "node_modules");

  if (await fileExists(nodeModulesPath)) {
    await fs.symlink(nodeModulesPath, path.join(destinationRoot, "node_modules"));
  }
}

async function renderPosts(postsDir, generatedDir) {
  const files = await collectMarkdownFiles(postsDir);
  const posts = await Promise.all(
    files.map(async (filePath) => {
      const raw = await fs.readFile(filePath, "utf8");
      const { content, data } = matter(raw);
      const markdownTitle = getLeadingMarkdownTitle(content);
      const body = markdownTitle ? stripLeadingMarkdownTitle(content) : content;
      const html = await marked.parse(body);
      const fallbackTitle = path.basename(filePath, ".md").replace(/[-_]+/g, " ");
      const title = String(data.title || markdownTitle || fallbackTitle);
      const slug = slugify(String(data.slug || title));
      const date = data.date ? new Date(data.date).toISOString() : "";

      return {
        slug,
        title,
        excerpt: getExcerpt(data, html),
        date,
        dateLabel: formatDate(date),
        html,
      };
    }),
  );

  posts.sort((left, right) => {
    if (!left.date && !right.date) {
      return left.title.localeCompare(right.title);
    }

    return right.date.localeCompare(left.date);
  });

  await fs.writeFile(
    path.join(generatedDir, "posts.ts"),
    `export type Post = {
  slug: string;
  title: string;
  excerpt: string;
  dateLabel: string;
  html: string;
};

export const posts: Post[] = ${JSON.stringify(
      posts.map(({ date, ...post }) => post),
      null,
      2,
    )};
`,
  );
  await fs.writeFile(path.join(generatedDir, "post-slugs.json"), `${JSON.stringify(posts.map((post) => post.slug), null, 2)}\n`);
}

async function collectMarkdownFiles(dir) {
  if (!(await fileExists(dir))) {
    return [];
  }

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

async function prerenderRoutes(distIndexPath, slugsPath, postsOutputDir) {
  const slugs = JSON.parse(await fs.readFile(slugsPath, "utf8"));
  const indexHtml = await fs.readFile(distIndexPath, "utf8");

  await Promise.all(
    slugs.map(async (slug) => {
      const routeDir = path.join(postsOutputDir, slug);
      await fs.mkdir(routeDir, { recursive: true });
      await fs.writeFile(path.join(routeDir, "index.html"), indexHtml);
    }),
  );
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function escapeHtml(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getLeadingMarkdownTitle(content) {
  return content.match(/^\s*#\s+(.+?)\s*$/m)?.[1]?.trim() ?? "";
}

function stripLeadingMarkdownTitle(content) {
  return content.replace(/^\s*#\s+.+?\s*(?:\r?\n|$)/, "").trimStart();
}

function getExcerpt(data, html) {
  const frontmatterExcerpt = data.excerpt || data.description || data.summary;

  if (frontmatterExcerpt) {
    return String(frontmatterExcerpt);
  }

  const firstParagraph = html.match(/<p>(.*?)<\/p>/s)?.[1] ?? "";
  return stripHtml(firstParagraph).slice(0, 180);
}

function stripHtml(value) {
  return value.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
}

function slugify(value) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function formatDate(date) {
  if (!date) {
    return "";
  }

  return new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
    year: "numeric",
  }).format(new Date(date));
}

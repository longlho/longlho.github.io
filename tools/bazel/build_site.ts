import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { XMLBuilder } from "fast-xml-parser";
import { build as viteBuild } from "vite";
import { renderPostsFromDir, type RenderedPost } from "../../post-renderer.ts";

type CopyOptions = {
  exclude: Set<string>;
};

type RssDocument = {
  "?xml": {
    "@_version": string;
    "@_encoding": string;
  };
  rss: {
    "@_version": string;
    "@_xmlns:atom": string;
    "@_xmlns:content": string;
    channel: {
      title: string;
      link: string;
      description: string;
      language: string;
      "atom:link": {
        "@_href": string;
        "@_rel": string;
        "@_type": string;
      };
      lastBuildDate?: string;
      item: RssItem[];
    };
  };
};

type RssItem = {
  title: string;
  link: string;
  guid: {
    "@_isPermaLink": string;
    "#text": string;
  };
  pubDate?: string;
  description: string;
  "content:encoded": {
    __cdata: string;
  };
};

const siteDescription = "Technical notes on frontend systems, build graphs, and product infrastructure.";
const siteTitle = "Long Ho";
const siteUrl = "https://longlho.github.io";
const xmlBuilder = new XMLBuilder({
  cdataPropName: "__cdata",
  format: true,
  ignoreAttributes: false,
  suppressBooleanAttributes: false,
  suppressEmptyNode: true,
});

const outputDir = process.argv[2] ? await resolveOutputDir(process.argv[2]) : "";

if (!outputDir) {
  throw new Error("Usage: build_site.ts <output-dir>");
}

const packageRoot = await findPackageRoot();
const workspaceDir = await fs.mkdtemp(path.join(os.tmpdir(), "site-build-"));
const buildOutputDir = path.join(workspaceDir, "dist");
const generatedDir = path.join(workspaceDir, "src", "generated");

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
await renderPosts(path.join(workspaceDir, "posts"), generatedDir, path.join(workspaceDir, "public", "feed.xml"));
await linkNodeModules(packageRoot, workspaceDir);

const previousCwd = process.cwd();
process.chdir(workspaceDir);
try {
  await viteBuild({
    base: "/",
    configFile: path.join(workspaceDir, "vite.config.ts"),
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

  throw new Error("Could not locate package.json for site build inputs.");
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

async function copyTree(source: string, destination: string, { exclude }: CopyOptions): Promise<void> {
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

async function copySymlinkTarget(sourcePath: string, destinationPath: string, { exclude }: CopyOptions): Promise<void> {
  const realPath = await fs.realpath(sourcePath);
  const targetStat = await fs.stat(realPath);

  if (targetStat.isDirectory()) {
    await copyTree(realPath, destinationPath, { exclude });
  } else if (targetStat.isFile()) {
    await fs.copyFile(realPath, destinationPath);
  }
}

async function linkNodeModules(sourceRoot: string, destinationRoot: string): Promise<void> {
  const nodeModulesPath = path.join(sourceRoot, "node_modules");

  if (await fileExists(nodeModulesPath)) {
    await fs.symlink(nodeModulesPath, path.join(destinationRoot, "node_modules"));
  }
}

async function renderPosts(postsDir: string, generatedDir: string, feedPath: string): Promise<void> {
  const posts = await renderPostsFromDir(postsDir);

  await fs.writeFile(path.join(generatedDir, "post-slugs.json"), `${JSON.stringify(posts.map((post) => post.slug), null, 2)}\n`);
  await fs.mkdir(path.dirname(feedPath), { recursive: true });
  await fs.writeFile(feedPath, renderRssFeed(posts));
}

async function prerenderRoutes(distIndexPath: string, slugsPath: string, postsOutputDir: string): Promise<void> {
  const slugs = JSON.parse(await fs.readFile(slugsPath, "utf8")) as string[];
  const indexHtml = await fs.readFile(distIndexPath, "utf8");

  await Promise.all(
    slugs.map(async (slug) => {
      const routeDir = path.join(postsOutputDir, slug);
      await fs.mkdir(routeDir, { recursive: true });
      await fs.writeFile(path.join(routeDir, "index.html"), indexHtml);
    }),
  );
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function renderRssFeed(posts: RenderedPost[]): string {
  const latestPostDate = posts.find((post) => post.date)?.date ?? "";
  const channel: RssDocument["rss"]["channel"] = {
    title: siteTitle,
    link: siteUrl,
    description: siteDescription,
    language: "en",
    "atom:link": {
      "@_href": `${siteUrl}/feed.xml`,
      "@_rel": "self",
      "@_type": "application/rss+xml",
    },
    ...(latestPostDate ? { lastBuildDate: formatRssDate(latestPostDate) } : {}),
    item: posts.map(createRssItem),
  };

  return `${xmlBuilder.build({
    "?xml": {
      "@_version": "1.0",
      "@_encoding": "UTF-8",
    },
    rss: {
      "@_version": "2.0",
      "@_xmlns:atom": "http://www.w3.org/2005/Atom",
      "@_xmlns:content": "http://purl.org/rss/1.0/modules/content/",
      channel,
    },
  } satisfies RssDocument)}\n`;
}

function createRssItem(post: RenderedPost): RssItem {
  const postUrl = `${siteUrl}/posts/${post.slug}/`;
  const item: RssItem = {
    title: post.title,
    link: postUrl,
    guid: {
      "@_isPermaLink": "true",
      "#text": postUrl,
    },
    description: post.excerpt,
    "content:encoded": {
      __cdata: post.html,
    },
  };

  if (post.date) {
    item.pubDate = formatRssDate(post.date);
  }

  return item;
}

function formatRssDate(date: string): string {
  return new Date(date).toUTCString();
}

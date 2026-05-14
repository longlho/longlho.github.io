import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { XMLBuilder } from "fast-xml-parser";
import matter from "gray-matter";
import { marked } from "marked";
import * as ts from "typescript";
import { build as viteBuild } from "vite";

type CopyOptions = {
  exclude: Set<string>;
};

type RenderedPost = {
  slug: string;
  title: string;
  excerpt: string;
  date: string;
  dateLabel: string;
  html: string;
};

type Frontmatter = {
  date?: string | Date;
  description?: unknown;
  excerpt?: unknown;
  slug?: unknown;
  summary?: unknown;
  title?: unknown;
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

const languageAliases = new Map([
  ["js", "ts"],
  ["javascript", "ts"],
  ["jsx", "tsx"],
  ["py", "python"],
  ["sh", "bash"],
  ["shell", "bash"],
]);

const tsKeywords = [
  "async",
  "await",
  "boolean",
  "class",
  "const",
  "export",
  "false",
  "from",
  "function",
  "if",
  "import",
  "interface",
  "let",
  "new",
  "null",
  "number",
  "return",
  "string",
  "true",
  "type",
  "undefined",
];

const languageKeywords: Record<string, string[]> = {
  bash: ["bazel", "build", "cd", "do", "done", "echo", "else", "export", "fi", "for", "if", "in", "pnpm", "run", "then"],
  json: ["false", "null", "true"],
  python: [
    "False",
    "None",
    "True",
    "and",
    "as",
    "class",
    "def",
    "elif",
    "else",
    "for",
    "from",
    "if",
    "import",
    "in",
    "is",
    "not",
    "or",
    "return",
    "with",
  ],
  ts: tsKeywords,
};

languageKeywords.tsx = tsKeywords;

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

marked.use({
  gfm: true,
  renderer: {
    code(token) {
      return renderCodeBlock(token);
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
await renderPosts(path.join(workspaceDir, "posts"), generatedDir, path.join(workspaceDir, "public", "feed.xml"));
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
  const files = await collectMarkdownFiles(postsDir);
  const posts: RenderedPost[] = await Promise.all(
    files.map(async (filePath) => {
      const raw = await fs.readFile(filePath, "utf8");
      const { content, data } = matter(raw) as { content: string; data: Frontmatter };
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

    return right.date.localeCompare(left.date) || left.title.localeCompare(right.title);
  });

  await fs.writeFile(
    path.join(generatedDir, "posts.ts"),
    printPostsModule(posts),
  );
  await fs.writeFile(path.join(generatedDir, "post-slugs.json"), `${JSON.stringify(posts.map((post) => post.slug), null, 2)}\n`);
  await fs.mkdir(path.dirname(feedPath), { recursive: true });
  await fs.writeFile(feedPath, renderRssFeed(posts));
}

async function collectMarkdownFiles(dir: string): Promise<string[]> {
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

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizeCodeLanguage(language = ""): string {
  const normalized = language.toLowerCase().trim().split(/\s+/)[0] ?? "";
  return languageAliases.get(normalized) ?? normalized;
}

function highlightCode(value: string, language: string): string {
  return value
    .split("\n")
    .map((line) => highlightCodeLine(line, language))
    .join("\n");
}

function highlightCodeLine(line: string, language: string): string {
  let html = "";
  let index = 0;

  while (index < line.length) {
    if (isLineCommentStart(line, index, language)) {
      html += `<span class="syntax-comment">${escapeHtml(line.slice(index))}</span>`;
      break;
    }

    if ((language === "ts" || language === "tsx") && line.startsWith("/*", index)) {
      const endIndex = line.indexOf("*/", index + 2);
      const tokenEnd = endIndex === -1 ? line.length : endIndex + 2;
      html += `<span class="syntax-comment">${escapeHtml(line.slice(index, tokenEnd))}</span>`;
      index = tokenEnd;
      continue;
    }

    if (isStringStart(line[index] ?? "", language)) {
      const tokenEnd = getStringEnd(line, index);
      html += `<span class="syntax-string">${escapeHtml(line.slice(index, tokenEnd))}</span>`;
      index = tokenEnd;
      continue;
    }

    const nextTokenIndex = getNextSpecialTokenIndex(line, index, language);
    html += highlightPlainCode(line.slice(index, nextTokenIndex), language);
    index = nextTokenIndex;
  }

  return html;
}

function isLineCommentStart(line: string, index: number, language: string): boolean {
  if ((language === "ts" || language === "tsx") && line.startsWith("//", index)) {
    return true;
  }

  return (language === "bash" || language === "python") && line[index] === "#";
}

function isStringStart(character: string, language: string): boolean {
  return character === '"' || character === "'" || ((language === "ts" || language === "tsx" || language === "bash") && character === "`");
}

function getStringEnd(line: string, startIndex: number): number {
  const quote = line[startIndex];
  let index = startIndex + 1;

  while (index < line.length) {
    if (line[index] === "\\") {
      index += 2;
      continue;
    }

    if (line[index] === quote) {
      return index + 1;
    }

    index += 1;
  }

  return line.length;
}

function getNextSpecialTokenIndex(line: string, startIndex: number, language: string): number {
  let nextIndex = line.length;

  for (const token of ['"', "'"]) {
    const tokenIndex = line.indexOf(token, startIndex);
    if (tokenIndex !== -1) {
      nextIndex = Math.min(nextIndex, tokenIndex);
    }
  }

  if (language === "ts" || language === "tsx" || language === "bash") {
    const templateIndex = line.indexOf("`", startIndex);
    if (templateIndex !== -1) {
      nextIndex = Math.min(nextIndex, templateIndex);
    }
  }

  if (language === "ts" || language === "tsx") {
    for (const token of ["//", "/*"]) {
      const tokenIndex = line.indexOf(token, startIndex);
      if (tokenIndex !== -1) {
        nextIndex = Math.min(nextIndex, tokenIndex);
      }
    }
  }

  if (language === "bash" || language === "python") {
    const commentIndex = line.indexOf("#", startIndex);
    if (commentIndex !== -1) {
      nextIndex = Math.min(nextIndex, commentIndex);
    }
  }

  return nextIndex;
}

function highlightPlainCode(value: string, language: string): string {
  const keywords = languageKeywords[language] ?? tsKeywords;
  const tokenPattern = new RegExp(`\\b(?:${keywords.join("|")})\\b|\\b\\d+(?:\\.\\d+)?\\b|[{}()[\\].,:;<>/+*=!?|&-]+`, "g");
  let html = "";
  let index = 0;

  for (const match of value.matchAll(tokenPattern)) {
    html += escapeHtml(value.slice(index, match.index));
    html += wrapPlainCodeToken(match[0], keywords);
    index = (match.index ?? 0) + match[0].length;
  }

  html += escapeHtml(value.slice(index));
  return html;
}

function wrapPlainCodeToken(token: string, keywords: string[]): string {
  if (keywords.includes(token)) {
    return `<span class="syntax-keyword">${escapeHtml(token)}</span>`;
  }

  if (/^\d/.test(token)) {
    return `<span class="syntax-number">${escapeHtml(token)}</span>`;
  }

  return `<span class="syntax-punctuation">${escapeHtml(token)}</span>`;
}

function renderCodeBlock(token: { lang?: string; text: string }): string {
  const language = normalizeCodeLanguage(token.lang);

  if (language === "mermaid") {
    const source = token.text.trim();
    return `<figure class="mermaid-diagram"><pre class="mermaid">${escapeHtml(source)}</pre></figure>`;
  }

  const languageClass = language ? ` language-${language}` : "";
  return `<pre class="code-block"><code class="${languageClass.trim()}">${highlightCode(token.text, language)}</code></pre>`;
}

function getLeadingMarkdownTitle(content: string): string {
  return content.match(/^\s*#\s+(.+?)\s*$/m)?.[1]?.trim() ?? "";
}

function stripLeadingMarkdownTitle(content: string): string {
  return content.replace(/^\s*#\s+.+?\s*(?:\r?\n|$)/, "").trimStart();
}

function getExcerpt(data: Frontmatter, html: string): string {
  const frontmatterExcerpt = data.excerpt || data.description || data.summary;

  if (frontmatterExcerpt) {
    return String(frontmatterExcerpt);
  }

  const firstParagraph = html.match(/<p>(.*?)<\/p>/s)?.[1] ?? "";
  return stripHtml(firstParagraph).slice(0, 180);
}

function stripHtml(value: string): string {
  return value.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
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

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function formatDate(date: string): string {
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

function printPostsModule(posts: RenderedPost[]): string {
  const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });
  const file = ts.factory.createSourceFile(
    [
      ts.factory.createTypeAliasDeclaration(
        [ts.factory.createModifier(ts.SyntaxKind.ExportKeyword)],
        "Post",
        undefined,
        ts.factory.createTypeLiteralNode([
          createStringPropertySignature("slug"),
          createStringPropertySignature("title"),
          createStringPropertySignature("excerpt"),
          createStringPropertySignature("date"),
          createStringPropertySignature("dateLabel"),
          createStringPropertySignature("html"),
        ]),
      ),
      ts.factory.createVariableStatement(
        [ts.factory.createModifier(ts.SyntaxKind.ExportKeyword)],
        ts.factory.createVariableDeclarationList(
          [
            ts.factory.createVariableDeclaration(
              "posts",
              undefined,
              ts.factory.createArrayTypeNode(ts.factory.createTypeReferenceNode("Post")),
              ts.factory.createArrayLiteralExpression(posts.map((post) => createPostNode(post)), true),
            ),
          ],
          ts.NodeFlags.Const,
        ),
      ),
    ],
    ts.factory.createToken(ts.SyntaxKind.EndOfFileToken),
    ts.NodeFlags.None,
  );

  return `${printer.printFile(file)}\n`;
}

function createStringPropertySignature(name: string): ts.PropertySignature {
  return ts.factory.createPropertySignature(
    undefined,
    name,
    undefined,
    ts.factory.createKeywordTypeNode(ts.SyntaxKind.StringKeyword),
  );
}

function createPostNode(post: RenderedPost): ts.ObjectLiteralExpression {
  return ts.factory.createObjectLiteralExpression(
    [
      createPostProperty("slug", post.slug),
      createPostProperty("title", post.title),
      createPostProperty("excerpt", post.excerpt),
      createPostProperty("date", post.date),
      createPostProperty("dateLabel", post.dateLabel),
      createPostProperty("html", post.html),
    ],
    true,
  );
}

function createPostProperty(name: string, value: string): ts.PropertyAssignment {
  return ts.factory.createPropertyAssignment(name, ts.factory.createStringLiteral(value));
}

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import matter from "gray-matter";
import { marked } from "marked";
import * as ts from "typescript";

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

type MarkedCodeToken = {
  lang?: string;
  text: string;
};

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const postsDir = path.join(root, "posts");
const generatedDir = path.join(root, "src", "generated");
const generatedPostsPath = path.join(generatedDir, "posts.ts");
const generatedSlugsPath = path.join(generatedDir, "post-slugs.json");

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

marked.use({
  gfm: true,
  renderer: {
    code(token) {
      return renderCodeBlock(token as MarkedCodeToken);
    },
  },
});

await renderPosts();

async function renderPosts(): Promise<void> {
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

  await fs.mkdir(generatedDir, { recursive: true });
  await fs.writeFile(
    generatedPostsPath,
    printPostsModule(posts),
  );
  await fs.writeFile(generatedSlugsPath, `${JSON.stringify(posts.map((post) => post.slug), null, 2)}\n`);
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

      if (!entry.name.endsWith(".md") || entry.name.toLowerCase() == "readme.md") {
        return [];
      }

      return [entryPath];
    }),
  );

  return nestedFiles.flat();
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

function renderCodeBlock(token: MarkedCodeToken): string {
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

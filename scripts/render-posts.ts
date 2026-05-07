import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import matter from "gray-matter";
import { marked } from "marked";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const postsDir = path.join(root, "posts");
const generatedDir = path.join(root, "src", "generated");
const generatedPostsPath = path.join(generatedDir, "posts.ts");
const generatedSlugsPath = path.join(generatedDir, "post-slugs.json");

const escapeHtml = (value) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const languageAliases = new Map([
  ["js", "ts"],
  ["javascript", "ts"],
  ["jsx", "tsx"],
  ["py", "python"],
  ["sh", "bash"],
  ["shell", "bash"],
]);

const languageKeywords = {
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
  ts: [
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
  ],
};

languageKeywords.tsx = languageKeywords.ts;

const normalizeCodeLanguage = (language = "") => {
  const normalized = language.toLowerCase().trim().split(/\s+/)[0] ?? "";
  return languageAliases.get(normalized) ?? normalized;
};

const highlightCode = (value, language) =>
  value
    .split("\n")
    .map((line) => highlightCodeLine(line, language))
    .join("\n");

const highlightCodeLine = (line, language) => {
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

    if (isStringStart(line[index], language)) {
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
};

const isLineCommentStart = (line, index, language) => {
  if ((language === "ts" || language === "tsx") && line.startsWith("//", index)) {
    return true;
  }

  return (language === "bash" || language === "python") && line[index] === "#";
};

const isStringStart = (character, language) =>
  character === '"' || character === "'" || ((language === "ts" || language === "tsx" || language === "bash") && character === "`");

const getStringEnd = (line, startIndex) => {
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
};

const getNextSpecialTokenIndex = (line, startIndex, language) => {
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
};

const highlightPlainCode = (value, language) => {
  const keywords = languageKeywords[language] ?? languageKeywords.ts;
  const tokenPattern = new RegExp(`\\b(?:${keywords.join("|")})\\b|\\b\\d+(?:\\.\\d+)?\\b|[{}()[\\].,:;<>/+*=!?|&-]+`, "g");
  let html = "";
  let index = 0;

  for (const match of value.matchAll(tokenPattern)) {
    html += escapeHtml(value.slice(index, match.index));
    html += wrapPlainCodeToken(match[0], keywords);
    index = match.index + match[0].length;
  }

  html += escapeHtml(value.slice(index));
  return html;
};

const wrapPlainCodeToken = (token, keywords) => {
  if (keywords.includes(token)) {
    return `<span class="syntax-keyword">${escapeHtml(token)}</span>`;
  }

  if (/^\d/.test(token)) {
    return `<span class="syntax-number">${escapeHtml(token)}</span>`;
  }

  return `<span class="syntax-punctuation">${escapeHtml(token)}</span>`;
};

const renderCodeBlock = (token) => {
  const language = normalizeCodeLanguage(token.lang);

  if (language === "mermaid") {
    const source = token.text.trim();
    return `<figure class="mermaid-diagram"><pre class="mermaid">${escapeHtml(source)}</pre></figure>`;
  }

  const languageClass = language ? ` language-${language}` : "";
  return `<pre class="code-block"><code class="${languageClass.trim()}">${highlightCode(token.text, language)}</code></pre>`;
};

marked.use({
  gfm: true,
  renderer: {
    code(token) {
      return renderCodeBlock(token);
    },
  },
});

const fileExists = async (filePath) => {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
};

const collectMarkdownFiles = async (dir) => {
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
};

const slugify = (value) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const stripHtml = (value) => value.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();

const getLeadingMarkdownTitle = (content) => content.match(/^\s*#\s+(.+?)\s*$/m)?.[1]?.trim() ?? "";

const stripLeadingMarkdownTitle = (content) => content.replace(/^\s*#\s+.+?\s*(?:\r?\n|$)/, "").trimStart();

const getExcerpt = (data, html) => {
  const frontmatterExcerpt = data.excerpt || data.description || data.summary;

  if (frontmatterExcerpt) {
    return String(frontmatterExcerpt);
  }

  const firstParagraph = html.match(/<p>(.*?)<\/p>/s)?.[1] ?? "";
  return stripHtml(firstParagraph).slice(0, 180);
};

const formatDate = (date) => {
  if (!date) {
    return "";
  }

  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(date));
};

const renderPosts = async () => {
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

    return right.date.localeCompare(left.date) || left.title.localeCompare(right.title);
  });

  await fs.mkdir(generatedDir, { recursive: true });
  await fs.writeFile(
    generatedPostsPath,
    `export type Post = {
  slug: string;
  title: string;
  excerpt: string;
  date: string;
  dateLabel: string;
  html: string;
};

export const posts: Post[] = ${JSON.stringify(posts, null, 2)};
`,
  );
  await fs.writeFile(generatedSlugsPath, `${JSON.stringify(posts.map((post) => post.slug), null, 2)}\n`);
};

await renderPosts();

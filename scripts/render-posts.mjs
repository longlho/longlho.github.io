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

    return right.date.localeCompare(left.date);
  });

  await fs.mkdir(generatedDir, { recursive: true });
  await fs.writeFile(
    generatedPostsPath,
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
  await fs.writeFile(generatedSlugsPath, `${JSON.stringify(posts.map((post) => post.slug), null, 2)}\n`);
};

await renderPosts();

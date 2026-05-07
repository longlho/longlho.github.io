import { posts } from "./generated/posts";
import "./styles.css";

type Focus = {
  title: string;
  summary: string;
  details: string[];
};

const focusAreas: Focus[] = [
  {
    title: "Build systems",
    summary:
      "Selective builds, explicit dependencies, generated metadata, and tooling that makes package boundaries feel natural.",
    details: ["Bazel", "TypeScript", "Monorepos"],
  },
  {
    title: "Frontend runtime",
    summary:
      "Shared browser, webview, and desktop capabilities with fewer one-off integrations across product surfaces.",
    details: ["Web apps", "Runtime design", "Platform APIs"],
  },
  {
    title: "Product engineering",
    summary:
      "Interfaces that stay fast and direct while still being easy to maintain after the first launch.",
    details: ["UX systems", "Routing", "Data loading"],
  },
];

const links = [
  { label: "GitHub", href: "https://github.com/longlho" },
  { label: "Writing", href: "/#writing" },
  { label: "LinkedIn", href: "https://www.linkedin.com/in/longlho" },
];

const app = document.querySelector<HTMLDivElement>("#app");

if (!app) {
  throw new Error("Missing #app root element");
}

const externalAttrs = (href: string) =>
  href.startsWith("http") ? 'target="_blank" rel="noreferrer"' : "";

const renderLinks = () =>
  links.map((link) => `<a href="${link.href}" ${externalAttrs(link.href)}>${link.label}</a>`).join("");

const renderHeader = () => `
  <header class="site-header" aria-label="Primary">
    <a class="wordmark" href="/" aria-label="Long Ho home">Long Ho</a>
    <nav class="nav-links" aria-label="Primary links">
      ${renderLinks()}
    </nav>
  </header>
`;

const renderFooter = () => `
  <footer class="site-footer">
    <p>Long Ho</p>
    <div>
      ${links
        .slice(0, 3)
        .map((link) => `<a href="${link.href}" ${externalAttrs(link.href)}>${link.label}</a>`)
        .join("")}
    </div>
  </footer>
`;

const renderPostList = () => {
  if (posts.length === 0) {
    return `
      <div class="empty-state">
        <strong>No posts published here yet.</strong>
        <p>New posts will live as Markdown in this repo and be rendered into static pages during deployment.</p>
      </div>
    `;
  }

  return `
    <div class="writing-list">
      ${posts
        .map(
          (post) => `
            <a class="writing-row" href="/posts/${post.slug}/">
              <span>${post.title}</span>
              <p>${post.excerpt}</p>
            </a>
          `,
        )
        .join("")}
    </div>
  `;
};

const renderHome = () => `
  ${renderHeader()}

  <main>
    <section class="writing-section writing-section-lead" id="writing" aria-labelledby="writing-title">
      <div class="section-heading">
        <p class="eyebrow">Articles</p>
        <h1 id="writing-title" class="writing-title">Technical notes on frontend systems, build graphs, and product infrastructure.</h1>
      </div>
      ${renderPostList()}
    </section>

    <section class="hero" aria-labelledby="intro-title">
      <div class="hero-copy">
        <p class="eyebrow">Long Ho</p>
        <h2 id="intro-title">I write about the engineering work behind durable web products.</h2>
        <p class="lede">
          The notes here sit where product work meets infrastructure: package graphs,
          runtime boundaries, type systems, build tools, and the small workflow choices
          that decide whether a team can keep moving.
        </p>
      </div>
    </section>

    <section class="band" aria-labelledby="work-title">
      <div class="section-heading">
        <p class="eyebrow">Current focus</p>
        <h2 id="work-title">A few threads that keep showing up</h2>
      </div>
      <div class="focus-grid">
        ${focusAreas
          .map(
            (area) => `
              <article class="focus-card">
                <h3>${area.title}</h3>
                <p>${area.summary}</p>
                <ul aria-label="${area.title} details">
                  ${area.details.map((detail) => `<li>${detail}</li>`).join("")}
                </ul>
              </article>
            `,
        )
        .join("")}
      </div>
    </section>
  </main>

  ${renderFooter()}
`;

const renderPostPage = (slug: string) => {
  const post = posts.find((candidate) => candidate.slug === slug);

  if (!post) {
    document.title = "Post not found | Long Ho";
    return `
      ${renderHeader()}
      <main class="post-shell">
        <article class="post-page">
          <a class="back-link" href="/#writing">Back to writing</a>
          <h1>Post not found</h1>
          <p>The post you are looking for is not published here.</p>
        </article>
      </main>
      ${renderFooter()}
    `;
  }

  document.title = `${post.title} | Long Ho`;

  return `
    ${renderHeader()}
    <main class="post-shell">
      <article class="post-page">
        <a class="back-link" href="/#writing">Back to writing</a>
        <p class="eyebrow">${post.dateLabel || "Writing"}</p>
        <h1>${post.title}</h1>
        ${post.html}
      </article>
    </main>
    ${renderFooter()}
  `;
};

const match = window.location.pathname.match(/^\/posts\/([^/]+)\/?$/);

app.innerHTML = match ? renderPostPage(match[1]) : renderHome();

const renderMermaidDiagrams = async () => {
  if (!document.querySelector(".mermaid")) {
    return;
  }

  const { default: mermaid } = await import("mermaid");

  mermaid.initialize({
    startOnLoad: false,
    securityLevel: "strict",
    theme: "base",
    themeVariables: {
      background: "#24251f",
      darkMode: true,
      fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
      lineColor: "#8f9f94",
      mainBkg: "#1d211e",
      primaryBorderColor: "#8f9f94",
      primaryColor: "#24362d",
      primaryTextColor: "#fff7e8",
      secondaryBorderColor: "#f0a36a",
      secondaryColor: "#2b2822",
      tertiaryColor: "#24251f",
    },
  });

  await mermaid.run({ querySelector: ".mermaid" });
};

void renderMermaidDiagrams();

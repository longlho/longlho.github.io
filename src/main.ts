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
    <section class="hero" aria-labelledby="intro-title">
      <div class="hero-copy">
        <p class="eyebrow">Frontend infrastructure and product engineering</p>
        <h1 id="intro-title">I build web systems that stay understandable as they get large.</h1>
        <p class="lede">
          I care about the places where product work meets infrastructure: package graphs,
          build tools, runtime boundaries, type systems, and the small workflow choices that
          decide whether a team can keep moving.
        </p>
        <div class="hero-actions">
          <a class="button primary" href="#writing">Read notes</a>
          <a class="button secondary" href="mailto:holevietlong@gmail.com">Get in touch</a>
        </div>
      </div>
      <aside class="hero-panel" aria-label="Current focus">
        <div>
          <span>01</span>
          <strong>Build systems</strong>
          <p>Selective builds, explicit dependencies, and generated metadata.</p>
        </div>
        <div>
          <span>02</span>
          <strong>Frontend runtime</strong>
          <p>Shared browser, webview, and desktop capabilities with fewer one-off integrations.</p>
        </div>
        <div>
          <span>03</span>
          <strong>Product craft</strong>
          <p>Interfaces that feel fast, direct, and maintainable after the first launch.</p>
        </div>
      </aside>
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

    <section class="writing-section" id="writing" aria-labelledby="writing-title">
      <div class="section-heading">
        <p class="eyebrow">Writing</p>
        <h2 id="writing-title">Posts from the parts of engineering that do not fit in a commit</h2>
      </div>
      ${renderPostList()}
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

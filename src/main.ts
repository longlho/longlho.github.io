import { posts } from "./generated/posts";
import type mermaidApi from "mermaid";
import mermaidScriptUrl from "mermaid/dist/mermaid.min.js?url";
import "./styles.css";

declare global {
  interface Window {
    mermaid?: typeof mermaidApi;
  }
}

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
  { label: "RSS", href: "/feed.xml" },
];

const app = document.querySelector<HTMLDivElement>("#app");

if (!app) {
  throw new Error("Missing #app root element");
}

const mermaidConfig = {
  fontFamily:
    'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  securityLevel: "strict",
  startOnLoad: false,
  theme: "base",
  themeVariables: {
    background: "#1a1d1a",
    darkMode: true,
    fontFamily:
      'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    lineColor: "#8f9f94",
    mainBkg: "#20271f",
    nodeBorder: "rgba(243, 234, 216, 0.34)",
    primaryBorderColor: "rgba(243, 234, 216, 0.34)",
    primaryColor: "#20271f",
    primaryTextColor: "#fff7e8",
    secondaryColor: "#263128",
    secondaryTextColor: "#fff7e8",
    tertiaryColor: "#1a1d1a",
    tertiaryTextColor: "#fff7e8",
    textColor: "#fff7e8",
  },
} satisfies Parameters<typeof mermaidApi.initialize>[0];

const loadMermaid = async () => {
  if (window.mermaid) {
    return window.mermaid;
  }

  await new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = mermaidScriptUrl;
    script.async = true;
    script.addEventListener("load", () => resolve(), { once: true });
    script.addEventListener("error", () => reject(new Error("Failed to load Mermaid runtime.")), { once: true });
    document.head.append(script);
  });

  if (!window.mermaid) {
    throw new Error("Mermaid runtime did not initialize.");
  }

  return window.mermaid;
};

const externalAttrs = (href: string) =>
  href.startsWith("http") ? 'target="_blank" rel="noreferrer"' : "";

const renderLinks = () =>
  links.map((link) => `<a href="${link.href}" ${externalAttrs(link.href)}>${link.label}</a>`).join("");

const renderPostDate = (post: { date: string; dateLabel: string }) =>
  post.date ? `<time datetime="${post.date}">${post.dateLabel}</time>` : "";

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
              <span>
                ${renderPostDate(post)}
                <strong>${post.title}</strong>
              </span>
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
        ${post.date ? `<time class="eyebrow" datetime="${post.date}">${post.dateLabel}</time>` : '<p class="eyebrow">Writing</p>'}
        <h1>${post.title}</h1>
        ${post.html}
      </article>
    </main>
    ${renderFooter()}
  `;
};

const match = window.location.pathname.match(/^\/posts\/([^/]+)\/?$/);

app.innerHTML = match ? renderPostPage(match[1]!) : renderHome();

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const setupMermaidDiagrams = () => {
  const figures = document.querySelectorAll<HTMLElement>(".mermaid-diagram");

  figures.forEach((figure, index) => {
    const svg = figure.querySelector<SVGSVGElement>("svg");
    if (!svg || figure.querySelector(".mermaid-toolbar")) {
      return;
    }

    svg.classList.add("mermaid-svg");
    if (svg.viewBox.baseVal.width > 0) {
      svg.style.width = `${svg.viewBox.baseVal.width}px`;
    }

    const stage = document.createElement("div");
    const canvas = document.createElement("div");
    const toolbar = document.createElement("div");
    let baseScale = 1;
    let scale = 1;
    let translateX = 0;
    let translateY = 0;
    let panStart: { x: number; y: number; translateX: number; translateY: number } | null = null;

    stage.className = "mermaid-stage";
    canvas.className = "mermaid-canvas";
    toolbar.className = "mermaid-toolbar";
    toolbar.setAttribute("aria-label", `Diagram ${index + 1} controls`);

    svg.replaceWith(stage);
    stage.append(canvas);
    canvas.append(svg);
    baseScale = clamp((stage.clientWidth - 48) / Math.max(svg.viewBox.baseVal.width, 1), 0.35, 1);
    scale = baseScale;

    const updateTransform = () => {
      canvas.style.transform = `translate(${translateX}px, ${translateY}px) scale(${scale})`;
      figure.dataset.zoomed = scale > baseScale ? "true" : "false";
    };

    const zoomBy = (delta: number) => {
      scale = clamp(Number((scale + delta).toFixed(2)), baseScale, 2.5);
      if (scale <= baseScale) {
        translateX = 0;
        translateY = 0;
      }
      updateTransform();
    };

    const reset = () => {
      scale = baseScale;
      translateX = 0;
      translateY = 0;
      updateTransform();
    };

    const addButton = (label: string, title: string, onClick: () => void) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = label;
      button.title = title;
      button.setAttribute("aria-label", title);
      button.addEventListener("click", onClick);
      toolbar.append(button);
    };

    addButton("+", "Zoom in", () => zoomBy(0.25));
    addButton("-", "Zoom out", () => zoomBy(-0.25));
    addButton("Fit", "Fit diagram", reset);
    figure.prepend(toolbar);

    stage.addEventListener("pointerdown", (event) => {
      if (scale <= baseScale) {
        return;
      }

      panStart = {
        x: event.clientX,
        y: event.clientY,
        translateX,
        translateY,
      };
      stage.setPointerCapture(event.pointerId);
    });

    stage.addEventListener("pointermove", (event) => {
      if (!panStart) {
        return;
      }

      translateX = panStart.translateX + event.clientX - panStart.x;
      translateY = panStart.translateY + event.clientY - panStart.y;
      updateTransform();
    });

    stage.addEventListener("pointerup", () => {
      panStart = null;
    });

    stage.addEventListener("pointercancel", () => {
      panStart = null;
    });

    updateTransform();
  });
};

const renderMermaidDiagrams = async () => {
  const nodes = Array.from(document.querySelectorAll<HTMLElement>(".mermaid"));
  if (nodes.length === 0) {
    return;
  }

  const mermaid = await loadMermaid();
  mermaid.initialize(mermaidConfig);
  await mermaid.run({ nodes });
};

await renderMermaidDiagrams();
setupMermaidDiagrams();

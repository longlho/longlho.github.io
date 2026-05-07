# longlho.github.io

Personal website for Long Ho, built as a static Vite site and deployed to GitHub Pages.

Posts are authored as Markdown files in `posts/`. During `bazel build //:site`, the Markdown files are rendered into generated TypeScript data and direct-linkable static routes under `/posts/<slug>/`.

## Development

```bash
pnpm install
pnpm run render:posts
pnpm run dev
```

## Build

```bash
bazel build //:site
```

The deployable artifact is `bazel-bin/dist`. The site is deployed from the `main` branch through the GitHub Pages workflow in `.github/workflows/pages.yml`.

# longlho.github.io

Personal website for Long Ho, built as a static Vite site and deployed to GitHub Pages.

Posts are authored as Markdown files in `posts/`. Local development renders them through a Vite virtual module. During `bazel build //:site`, Bazel renders the deployable site, direct-linkable static routes under `/posts/<slug>/`, and an RSS feed at `/feed.xml` without checking generated post data into source control.

## Development

```bash
pnpm install
pnpm run dev
```

## Build

```bash
bazel build //:site
```

The deployable artifact is `bazel-bin/dist`. The site is deployed from the `main` branch through the GitHub Pages workflow in `.github/workflows/pages.yml`.

## Production Preview

```bash
bazel run //:prod
```

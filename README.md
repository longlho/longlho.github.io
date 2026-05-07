# longlho.github.io

Personal website for Long Ho, built as a static Vite site and deployed to GitHub Pages.

Posts are authored as Markdown files in `posts/`. During `npm run build`, the Markdown files are rendered into generated TypeScript data and direct-linkable static routes under `/posts/<slug>/`.

## Development

```bash
npm install
npm run render:posts
npm run dev
```

## Build

```bash
npm run build
```

The site is deployed from the `main` branch through the GitHub Pages workflow in `.github/workflows/pages.yml`.

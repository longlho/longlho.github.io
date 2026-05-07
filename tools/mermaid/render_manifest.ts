import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import puppeteer from "puppeteer";
import { renderMermaid } from "@mermaid-js/mermaid-cli";

type MermaidManifestOptions = {
  outputDir: string;
  sources: Map<string, string>;
};

const puppeteerConfig = {
  args: ["--no-sandbox", "--disable-setuid-sandbox"],
};

const mermaidConfig = {
  deterministicIds: true,
  deterministicIDSeed: "longlho",
  fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
  securityLevel: "strict",
  startOnLoad: false,
  theme: "base",
  flowchart: {
    htmlLabels: false,
  },
  themeVariables: {
    background: "#1a1d1a",
    darkMode: true,
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
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
};

const mermaidCss = (svgId: string) => `
#${svgId} {
  background: #1a1d1a;
}
#${svgId} .edgeLabel,
#${svgId} .messageText,
#${svgId} .actor,
#${svgId} .titleText,
#${svgId} .legend text {
  color: #fff7e8 !important;
  fill: #fff7e8 !important;
}
#${svgId} .edgeLabel span {
  color: #fff7e8 !important;
}
#${svgId} foreignObject {
  overflow: visible !important;
}
#${svgId} .label p,
#${svgId} .nodeLabel p {
  color: inherit !important;
}
#${svgId} .labelBkg,
#${svgId} .edgeLabel rect,
#${svgId} .label rect {
  background: #1a1d1a !important;
  fill: #1a1d1a !important;
}
`;

export const hashMermaidSource = (source: string): string =>
  createHash("sha256").update(source).digest("hex").slice(0, 16);

export const collectMermaidDiagrams = (markdown: string): Map<string, string> => {
  const diagrams = new Map<string, string>();

  for (const match of markdown.matchAll(/```mermaid\n([\s\S]*?)```/g)) {
    const source = match[1].trim();
    diagrams.set(hashMermaidSource(source), source);
  }

  return diagrams;
};

export async function renderMermaidManifest({ outputDir, sources }: MermaidManifestOptions): Promise<Record<string, string>> {
  await fs.rm(outputDir, { force: true, recursive: true });
  await fs.mkdir(outputDir, { recursive: true });

  const manifest: Record<string, string> = {};
  const browser = await puppeteer.launch(puppeteerConfig);

  try {
    for (const [hash, source] of [...sources.entries()].sort(([left], [right]) => left.localeCompare(right))) {
      const fileName = `${hash}.svg`;
      const svgId = `mermaid-${hash}`;
      manifest[hash] = fileName;
      const { data } = await renderMermaid(browser, source, "svg", {
        backgroundColor: "#1a1d1a",
        mermaidConfig: {
          ...mermaidConfig,
          deterministicIDSeed: hash,
        },
        myCSS: mermaidCss(svgId),
        svgId,
        viewport: { width: 1440, height: 1200, deviceScaleFactor: 1 },
      });

      await fs.writeFile(path.join(outputDir, fileName), data);
    }

    await fs.writeFile(path.join(outputDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  } finally {
    await browser.close();
  }

  return manifest;
}

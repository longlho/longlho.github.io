import path from "node:path";
import { pathToFileURL } from "node:url";
import { defineConfig, type Plugin } from "vite";

const root = process.cwd();
const postRendererUrl =
  import.meta.resolve?.("#tools/post-renderer.ts") ??
  pathToFileURL(path.join(root, "tools", "post-renderer.ts")).href;
const virtualPostsModuleId = "virtual:posts";
const resolvedVirtualPostsModuleId = `\0${virtualPostsModuleId}`;

type PostRenderer = {
  printPostsJavaScriptModule(posts: unknown[]): string;
  renderPostsFromDir(postsDir: string): Promise<unknown[]>;
};

function postsPlugin(): Plugin {
  return {
    name: "site-posts",
    resolveId(id) {
      if (id === virtualPostsModuleId) {
        return resolvedVirtualPostsModuleId;
      }
    },
    async load(id) {
      if (id !== resolvedVirtualPostsModuleId) {
        return;
      }

      const { printPostsJavaScriptModule, renderPostsFromDir } = (await import(
        postRendererUrl
      )) as PostRenderer;
      return printPostsJavaScriptModule(await renderPostsFromDir(path.join(root, "posts")));
    },
    handleHotUpdate({ file, server }) {
      if (!file.endsWith(".md") || !path.normalize(file).includes(`${path.sep}posts${path.sep}`)) {
        return;
      }

      const postsModule = server.moduleGraph.getModuleById(resolvedVirtualPostsModuleId);
      if (!postsModule) {
        return;
      }

      server.moduleGraph.invalidateModule(postsModule);
      return [postsModule];
    },
  };
}

export default defineConfig({
  base: "/",
  plugins: [postsPlugin()],
  resolve: {
    alias: {
      "#/": `${root}/`,
    },
  },
  server: {
    watch: {
      ignored: ["**/bazel-*/**", "**/bazel-bin/**", "**/bazel-out/**", "**/bazel-testlogs/**"],
    },
  },
});

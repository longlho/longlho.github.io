import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import { printPostsJavaScriptModule, renderPostsFromDir } from "./post-renderer";

const root = path.dirname(fileURLToPath(import.meta.url));
const virtualPostsModuleId = "virtual:posts";
const resolvedVirtualPostsModuleId = `\0${virtualPostsModuleId}`;

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
  server: {
    watch: {
      ignored: ["**/bazel-*/**", "**/bazel-bin/**", "**/bazel-out/**", "**/bazel-testlogs/**"],
    },
  },
});

import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

type Options = {
  dist?: string;
  host: string;
  port: number;
};

const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".map", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".txt", "text/plain; charset=utf-8"],
  [".webmanifest", "application/manifest+json; charset=utf-8"],
  [".xml", "application/xml; charset=utf-8"],
]);

const options = parseArgs(process.argv.slice(2));
const distDir = path.resolve(options.dist ?? (await findDefaultDistDir()));
await assertDirectory(distDir);

const { port, server } = await listenWithFallback(distDir, options.host, options.port);

console.log(`Serving ${distDir}`);
console.log(`Local: http://${options.host}:${port}/`);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
  });
}

function parseArgs(args: string[]): Options {
  const parsed: Options = {
    host: process.env.HOST || "127.0.0.1",
    port: Number(process.env.PORT || 4173),
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index] ?? "";
    const next = args[index + 1];

    if (arg === "--host" && next) {
      parsed.host = next;
      index += 1;
    } else if (arg === "--port" && next) {
      parsed.port = Number(next);
      index += 1;
    } else if (arg === "--dist" && next) {
      parsed.dist = next;
      index += 1;
    }
  }

  if (!Number.isInteger(parsed.port) || parsed.port <= 0) {
    throw new Error(`Invalid port: ${parsed.port}`);
  }

  return parsed;
}

async function findDefaultDistDir(): Promise<string> {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(process.cwd(), "bazel-bin", "dist"),
    path.resolve(scriptDir, "..", "..", "dist"),
  ];

  if (process.env.RUNFILES_DIR) {
    candidates.push(
      path.join(process.env.RUNFILES_DIR, "_main", "dist"),
      path.join(process.env.RUNFILES_DIR, "longlho_github_io", "dist"),
      path.join(process.env.RUNFILES_DIR, "dist"),
    );
  }

  for (const candidate of candidates) {
    if (await isDirectory(candidate)) {
      return candidate;
    }
  }

  throw new Error(`Could not find Bazel-built dist directory. Tried:\n${candidates.join("\n")}`);
}

async function assertDirectory(dir: string): Promise<void> {
  if (!(await isDirectory(dir))) {
    throw new Error(`Dist path is not a directory: ${dir}`);
  }
}

async function isDirectory(candidate: string): Promise<boolean> {
  try {
    return (await fs.stat(candidate)).isDirectory();
  } catch {
    return false;
  }
}

async function listenWithFallback(distDir: string, host: string, startPort: number) {
  let port = startPort;

  while (port < startPort + 20) {
    const server = createServer(distDir);
    try {
      await listen(server, host, port);
      return { port, server };
    } catch (error) {
      server.close();
      if (!isAddressInUse(error)) {
        throw error;
      }
      port += 1;
    }
  }

  throw new Error(`No available port found from ${startPort} to ${port - 1}.`);
}

function createServer(distDir: string): http.Server {
  return http.createServer(async (request, response) => {
    try {
      if (request.method !== "GET" && request.method !== "HEAD") {
        response.writeHead(405, { Allow: "GET, HEAD" });
        response.end();
        return;
      }

      const filePath = await resolveRequestPath(distDir, request.url ?? "/");
      const body = await fs.readFile(filePath);
      response.writeHead(200, {
        "Cache-Control": "no-store",
        "Content-Type": contentTypes.get(path.extname(filePath)) ?? "application/octet-stream",
      });

      response.end(request.method === "HEAD" ? undefined : body);
    } catch (error) {
      if (isNotFound(error)) {
        response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        response.end("Not found");
        return;
      }

      response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      response.end(error instanceof Error ? error.message : "Internal server error");
    }
  });
}

async function resolveRequestPath(distDir: string, requestUrl: string): Promise<string> {
  const url = new URL(requestUrl, "http://localhost");
  const pathname = decodeURIComponent(url.pathname);
  const resolvedPath = path.resolve(distDir, `.${pathname}`);

  if (resolvedPath !== distDir && !resolvedPath.startsWith(`${distDir}${path.sep}`)) {
    throw Object.assign(new Error("Forbidden"), { code: "ENOENT" });
  }

  const stat = await fs.stat(resolvedPath).catch(() => undefined);

  if (stat?.isDirectory()) {
    return path.join(resolvedPath, "index.html");
  }

  if (stat?.isFile()) {
    return resolvedPath;
  }

  const extension = path.extname(resolvedPath);
  if (!extension) {
    return path.join(resolvedPath, "index.html");
  }

  throw Object.assign(new Error("Not found"), { code: "ENOENT" });
}

function listen(server: http.Server, host: string, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.off("error", reject);
      resolve();
    });
  });
}

function isAddressInUse(error: unknown): boolean {
  return isNodeError(error) && error.code === "EADDRINUSE";
}

function isNotFound(error: unknown): boolean {
  return isNodeError(error) && error.code === "ENOENT";
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

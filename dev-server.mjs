import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};
const host = option("--host", "0.0.0.0");
const port = Number(option("--port", "4173"));
const root = process.cwd();
const types = {
  ".css": "text/css", ".data": "application/octet-stream", ".html": "text/html",
  ".js": "text/javascript", ".json": "application/json", ".mjs": "text/javascript",
  ".png": "image/png", ".wasm": "application/wasm", ".woff2": "font/woff2",
};

createServer(async (request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
  const relative = normalize(pathname).replace(/^[/\\]+/, "");
  let file = join(root, relative || "index.html");
  if (!file.startsWith(root)) file = join(root, "index.html");
  try {
    if ((await stat(file)).isDirectory()) file = join(file, "index.html");
    const info = await stat(file);
    response.writeHead(200, {
      "Content-Type": types[extname(file)] || "application/octet-stream",
      "Content-Length": info.size,
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    });
    createReadStream(file).pipe(response);
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain" });
    response.end("Not found");
  }
}).listen(port, host, () => console.log(`Preview listening on ${host}:${port}`));

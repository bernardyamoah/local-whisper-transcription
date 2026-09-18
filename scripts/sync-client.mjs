import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";

await mkdir("studio/static", { recursive: true });
await rm("studio/static/assets", { recursive: true, force: true });
await cp("dist/client/assets", "studio/static/assets", { recursive: true });
const shell = await readFile("dist/client/_shell.html", "utf8");
const cleanShell = shell.replaceAll("\0", "\ufffd");
const bootstrapWrites = [];
const externalShell = cleanShell.replace(
  /<script([^>]*)>([\s\S]*?)<\/script>/g,
  (tag, attributes, body) => {
    if (!body || attributes.includes("src=")) return tag;
    const hash = createHash("sha256").update(body).digest("hex").slice(0, 12);
    const filename = `bootstrap-${hash}.js`;
    bootstrapWrites.push(writeFile(`studio/static/assets/${filename}`, body));
    return `<script${attributes} src="/assets/${filename}"></script>`;
  },
);
await Promise.all(bootstrapWrites);
await writeFile("studio/static/index.html", externalShell);

await import("./build-website.mjs");
await rm("studio/static/website", { recursive: true, force: true });
await cp("dist/website", "studio/static/website", { recursive: true });

import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";

await mkdir("studio/static", { recursive: true });
await rm("studio/static/assets", { recursive: true, force: true });
await cp("dist/client/assets", "studio/static/assets", { recursive: true });
const shell = await readFile("dist/client/_shell.html", "utf8");
await writeFile("studio/static/index.html", shell.replaceAll("\0", "\ufffd"));

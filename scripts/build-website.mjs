import { cp, mkdir, rm } from "node:fs/promises";
const destination = "dist/website";
await rm(destination, { recursive: true, force: true });
await mkdir(destination, { recursive: true });
await cp("website", destination, { recursive: true });
await cp("studio/static/fonts", `${destination}/fonts`, { recursive: true });
await cp("studio/static/mark.svg", `${destination}/mark.svg`);

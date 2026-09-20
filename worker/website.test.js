import assert from "node:assert/strict";
import test from "node:test";

import worker from "./website.js";

test("release manifest remains readable by updater 0.5.19 and current clients", async () => {
  const uploaded = new Date("2026-09-20T20:09:38.849Z");
  const env = {
    DOWNLOADS: {
      async list() {
        return {
          objects: [
            {
              key: "releases/Whisper-Studio-0.5.21-arm64.dmg",
              size: 162_223_996,
              uploaded,
            },
          ],
        };
      },
    },
  };

  const response = await worker.fetch(
    new Request("https://transcribe.bernardyamoah.com/api/releases/latest"),
    env,
  );
  const manifest = await response.json();

  assert.equal(response.status, 200);
  assert.equal(
    manifest.download_url,
    "https://transcribe.bernardyamoah.com/download/Whisper-Studio.dmg",
  );
  assert.equal(manifest.downloadURL, manifest.download_url);
});

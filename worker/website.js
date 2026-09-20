const DOWNLOAD_PATH = "/download/Whisper-Studio.dmg";
const RELEASE_PATH = "/api/releases/latest";
const RELEASE_PREFIX = "releases/Whisper-Studio-";
const RELEASE_PATTERN = /^releases\/Whisper-Studio-(\d+\.\d+\.\d+)-arm64\.dmg$/;

function versionParts(version) {
  return version.split(".").map(Number);
}

function compareVersions(left, right) {
  const a = versionParts(left);
  const b = versionParts(right);
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const difference = (a[index] || 0) - (b[index] || 0);
    if (difference) return difference;
  }
  return 0;
}

function checksumHex(value) {
  if (!value) return null;
  return [...new Uint8Array(value)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function latestRelease(env) {
  const listing = await env.DOWNLOADS.list({ prefix: RELEASE_PREFIX });
  const releases = listing.objects
    .map((object) => {
      const match = object.key.match(RELEASE_PATTERN);
      return match ? { object, version: match[1] } : null;
    })
    .filter(Boolean)
    .sort((left, right) => compareVersions(right.version, left.version));
  return releases[0] || null;
}

function downloadHeaders(object, filename) {
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("accept-ranges", "bytes");
  headers.set("cache-control", "no-cache");
  headers.set("content-type", "application/x-apple-diskimage");
  headers.set("content-disposition", `attachment; filename="${filename}"`);
  headers.set("x-content-type-options", "nosniff");
  return headers;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === RELEASE_PATH) {
      if (request.method !== "GET") {
        return new Response("Method not allowed", {
          status: 405,
          headers: { allow: "GET" },
        });
      }
      const release = await latestRelease(env);
      if (!release)
        return new Response("No release available", { status: 404 });
      const filename = release.object.key.split("/").pop();
      const downloadURL = new URL(DOWNLOAD_PATH, request.url).toString();
      return Response.json(
        {
          version: release.version,
          download_url: downloadURL,
          // Updater 0.5.19 used convertFromSnakeCase, which cannot map the
          // URL acronym in download_url to the downloadURL Swift property.
          downloadURL,
          filename,
          size_bytes: release.object.size,
          sha256: checksumHex(release.object.checksums?.sha256),
          published_at: release.object.uploaded?.toISOString() || null,
        },
        {
          headers: {
            "cache-control": "public, max-age=300",
            "x-content-type-options": "nosniff",
          },
        },
      );
    }
    if (url.pathname !== DOWNLOAD_PATH) return env.ASSETS.fetch(request);
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method not allowed", {
        status: 405,
        headers: { allow: "GET, HEAD" },
      });
    }

    const release = await latestRelease(env);
    if (!release) return new Response("Installer unavailable", { status: 404 });
    const filename = release.object.key.split("/").pop();
    let object;
    try {
      object = await env.DOWNLOADS.get(release.object.key, {
        range: request.headers,
      });
    } catch {
      return new Response("Range not satisfiable", {
        status: 416,
        headers: { "content-range": "bytes */*" },
      });
    }
    if (!object) return new Response("Installer unavailable", { status: 404 });

    const headers = downloadHeaders(object, filename);
    if (request.headers.has("range") && object.range) {
      const length = Math.min(
        object.range.length ?? object.range.suffix ?? object.size,
        object.size,
      );
      const offset = object.range.offset ?? Math.max(0, object.size - length);
      headers.set(
        "content-range",
        `bytes ${offset}-${offset + length - 1}/${object.size}`,
      );
      headers.set("content-length", String(length));
      return new Response(request.method === "HEAD" ? null : object.body, {
        status: 206,
        headers,
      });
    }
    headers.set("content-length", String(object.size));
    return new Response(request.method === "HEAD" ? null : object.body, {
      headers,
    });
  },
};

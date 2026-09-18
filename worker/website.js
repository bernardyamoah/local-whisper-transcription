const DOWNLOAD_PATH = "/download/Whisper-Studio.dmg";
const DOWNLOAD_KEY = "releases/Whisper-Studio-0.4.20-arm64.dmg";

function downloadHeaders(object) {
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("accept-ranges", "bytes");
  headers.set("cache-control", "public, max-age=3600");
  headers.set("content-type", "application/x-apple-diskimage");
  headers.set(
    "content-disposition",
    'attachment; filename="Whisper-Studio-0.4.20-arm64.dmg"',
  );
  headers.set("x-content-type-options", "nosniff");
  return headers;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== DOWNLOAD_PATH) return env.ASSETS.fetch(request);
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method not allowed", {
        status: 405,
        headers: { allow: "GET, HEAD" },
      });
    }

    let object;
    try {
      object = await env.DOWNLOADS.get(DOWNLOAD_KEY, {
        range: request.headers,
      });
    } catch {
      return new Response("Range not satisfiable", {
        status: 416,
        headers: { "content-range": "bytes */*" },
      });
    }
    if (!object) return new Response("Installer unavailable", { status: 404 });

    const headers = downloadHeaders(object);
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

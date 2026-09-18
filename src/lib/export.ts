function exportName(response: Response, fallback: string) {
  const disposition = response.headers.get("Content-Disposition") || "";
  const encoded = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  if (!encoded) return fallback;
  try {
    return decodeURIComponent(encoded);
  } catch {
    return fallback;
  }
}

export async function downloadTranscript(
  jobId: string,
  format: string,
  fallbackName: string,
  view = "transcript",
) {
  const path = `/api/jobs/${jobId}/export/${format}?view=${encodeURIComponent(view)}`;
  const response = await fetch(path, {
    headers: { "X-Studio-Request": "1" },
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.detail || `Export failed (${response.status}).`);
  }

  const name = exportName(response, fallbackName);
  const bridge = window.pywebview?.api;
  if (bridge?.save_export_url) {
    await response.body?.cancel();
    return bridge.save_export_url(
      name,
      new URL(path, window.location.href).href,
    );
  }
  const blob = await response.blob();
  const nativeSave = bridge?.save_export;
  if (nativeSave) {
    if (["pdf", "docx", "bundle"].includes(format)) {
      if (!bridge?.save_export_base64)
        throw new Error("Restart Whisper Studio to enable binary exports.");
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let binary = "";
      for (let index = 0; index < bytes.length; index += 32768) {
        binary += String.fromCharCode(...bytes.subarray(index, index + 32768));
      }
      return bridge.save_export_base64(name, btoa(binary));
    }
    return nativeSave(name, await blob.text());
  }

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  return null;
}

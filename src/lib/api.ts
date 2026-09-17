export async function api<T>(path: string, options: RequestInit = {}) {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      ...options,
      headers: {
        "X-Studio-Request": "1",
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...options.headers,
      },
    });
  } catch {
    throw new Error("The local studio is unreachable.");
  }
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.detail || `Request failed (${response.status}).`);
  }
  return response.json() as Promise<T>;
}

export const time = (seconds = 0) => {
  const whole = Math.floor(seconds);
  return `${Math.floor(whole / 60)
    .toString()
    .padStart(2, "0")}:${(whole % 60).toString().padStart(2, "0")}`;
};

export const bytes = (size = 0) =>
  size > 1e9
    ? `${(size / 1e9).toFixed(1)} GB`
    : `${(size / 1e6).toFixed(1)} MB`;

export const date = (timestamp: number) =>
  new Date(timestamp * 1000).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

export const titleCase = (value: string) =>
  value.charAt(0).toUpperCase() + value.slice(1);

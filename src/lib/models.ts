export const RECOMMENDED_MODEL_IDS = ["small", "turbo", "large-v3"] as const;

export function isRecommendedModel(id: string) {
  return (RECOMMENDED_MODEL_IDS as readonly string[]).includes(id);
}

export function presetLabel(id: string) {
  return { fast: "Quick", balanced: "Balanced", accurate: "Precise" }[id] ?? id;
}

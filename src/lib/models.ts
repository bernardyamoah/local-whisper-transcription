export const RECOMMENDED_MODEL_IDS = [
  "base",
  "small",
  "medium",
  "large-v3-turbo",
  "large-v3",
] as const;

export function isRecommendedModel(id: string) {
  return (RECOMMENDED_MODEL_IDS as readonly string[]).includes(id);
}

export function cn(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export function normalizeWhitespace(text: string) {
  return text.replace(/\r/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

export function toTitleCase(value: string) {
  return value
    .toLowerCase()
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function unique<T>(items: T[]) {
  return Array.from(new Set(items));
}

export function average(values: number[]) {
  if (!values.length) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function clamp(value: number, min = 0, max = 100) {
  return Math.min(max, Math.max(min, value));
}

export function splitSentences(text: string) {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

export function extractBulletLikeLines(text: string) {
  return text
    .split("\n")
    .map((line) => line.replace(/^[\s\-*•]+/, "").trim())
    .filter((line) => line.length > 2);
}

export function keywordOverlapScore(answer: string, keywords: string[]) {
  if (!answer.trim() || !keywords.length) {
    return 0;
  }

  const lower = answer.toLowerCase();
  const matches = keywords.filter((keyword) => lower.includes(keyword.toLowerCase())).length;
  return clamp((matches / Math.max(keywords.length, 4)) * 100);
}

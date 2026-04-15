export function extractJsonObject(text: string) {
  const trimmed = text.trim();

  try {
    return JSON.parse(trimmed);
  } catch {
    const codeBlock = trimmed.match(/```json\s*([\s\S]*?)```/i)?.[1] ?? trimmed.match(/```([\s\S]*?)```/i)?.[1];

    if (codeBlock) {
      return JSON.parse(codeBlock.trim());
    }

    const firstBrace = trimmed.indexOf("{");
    const lastBrace = trimmed.lastIndexOf("}");

    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1));
    }

    throw new Error("Model response did not contain valid JSON.");
  }
}


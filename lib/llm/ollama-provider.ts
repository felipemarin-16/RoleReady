import { extractJsonObject } from "@/lib/llm/json";
import type { JsonChatInput, LlmProvider } from "@/lib/llm/types";

type OllamaMessage = {
  role: "system" | "user";
  content: string;
};

type OllamaChatResponse = {
  message?: {
    content?: string;
  };
};

export class OllamaProvider implements LlmProvider {
  readonly providerName = "ollama" as const;

  private readonly baseUrl: string;
  private readonly model: string;
  private readonly timeoutMs: number;

  constructor() {
    this.baseUrl = process.env.OLLAMA_BASE_URL?.trim() || "http://127.0.0.1:11434";
    this.model = process.env.OLLAMA_MODEL?.trim() || "qwen3:4b";
    this.timeoutMs = Number.parseInt(process.env.OLLAMA_TIMEOUT_MS || "45000", 10);
  }

  async generateJson<T>({ systemPrompt, userPrompt }: JsonChatInput): Promise<T> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(`${this.baseUrl}/api/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: this.model,
          stream: false,
          format: "json",
          options: {
            temperature: 0.35,
            top_p: 0.9,
          },
          messages: [
            { role: "system", content: systemPrompt } satisfies OllamaMessage,
            { role: "user", content: userPrompt } satisfies OllamaMessage,
          ],
        }),
        cache: "no-store",
        signal: controller.signal,
      });

      if (!response.ok) {
        const details = await response.text();
        throw new Error(`Ollama request failed (${response.status}): ${details || "No details provided."}`);
      }

      const payload = (await response.json()) as OllamaChatResponse;
      const content = payload.message?.content?.trim();

      if (!content) {
        throw new Error("Ollama response did not contain message content.");
      }

      return extractJsonObject(content) as T;
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error(`Ollama request timed out after ${this.timeoutMs}ms.`);
      }

      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}


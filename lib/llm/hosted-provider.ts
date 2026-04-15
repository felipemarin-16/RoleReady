import type { JsonChatInput, LlmProvider } from "@/lib/llm/types";

export class HostedProvider implements LlmProvider {
  readonly providerName = "hosted" as const;

  async generateJson<T>(_input: JsonChatInput): Promise<T> {
    throw new Error(
      "Hosted LLM provider is not configured yet. Set INTERVIEW_LLM_PROVIDER=ollama for local development.",
    );
  }
}


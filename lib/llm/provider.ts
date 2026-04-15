import { HostedProvider } from "@/lib/llm/hosted-provider";
import { OllamaProvider } from "@/lib/llm/ollama-provider";
import type { LlmProvider } from "@/lib/llm/types";

export function getLlmProvider(): LlmProvider {
  const mode = (process.env.INTERVIEW_LLM_PROVIDER || "ollama").toLowerCase();

  if (mode === "hosted") {
    return new HostedProvider();
  }

  return new OllamaProvider();
}


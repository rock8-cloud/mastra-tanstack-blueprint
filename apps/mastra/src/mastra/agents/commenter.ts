import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { Agent } from "@mastra/core/agent";

import { requireEnv } from "../../env.js";

/**
 * The model is defined purely by env vars — no provider is hardcoded. Any
 * OpenAI-compatible endpoint (a gateway, a self-hosted vLLM, OpenAI itself)
 * works by changing configuration, not code.
 */
function createGatewayModel() {
  const gateway = createOpenAICompatible({
    name: "gateway",
    baseURL: requireEnv("AI_GATEWAY_BASE_URL"),
    apiKey: requireEnv("AI_GATEWAY_API_KEY"),
  });

  return gateway.chatModel(requireEnv("AI_MODEL"));
}

let model: ReturnType<typeof createGatewayModel> | undefined;

export const commenterAgent = new Agent({
  id: "commenter",
  name: "commenter",
  description: "Writes a short, practical comment on a newly created todo.",
  instructions: [
    "You comment on todo items in a todo app.",
    "Given a todo title, reply with exactly ONE comment of 1-2 sentences suggesting a concrete way to approach that task.",
    "Be specific and actionable. No greetings, no preamble, no bullet points, no quotes — return the comment text only.",
  ].join("\n"),
  // Mastra accepts a function here, so credentials are read on the first agent
  // call rather than at import time — `mastra build` needs no secrets.
  model: () => (model ??= createGatewayModel()),
});

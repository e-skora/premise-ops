// High-traffic API gateway consumer
// References exported symbols from packages/llm-gateway/src/semantic-cache.ts
import {
  routeInferenceWithSemanticCache,
  InferenceRequest,
} from "../packages/llm-gateway/src/semantic-cache";

export async function handleUserChatRequest(userInput: string, tenantId: string) {
  const req: InferenceRequest = {
    prompt: userInput,
    model: "claude-3-7-sonnet",
    tenantId,
  };

  // Route through semantic vector cache microservice
  const result = await routeInferenceWithSemanticCache(req);
  return {
    status: 200,
    source: result.source,
    text: result.completion,
  };
}

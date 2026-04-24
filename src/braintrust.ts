import { addTraceProcessor } from "@openai/agents";
import { OpenAIAgentsTraceProcessor } from "@braintrust/openai-agents";
import { initLogger } from "braintrust";

declare global {
  var __braintrustAgentsConfigured: boolean | undefined;
}

const apiKey = process.env.BRAINTRUST_API_KEY?.trim();

export const braintrustLogger = apiKey
  ? initLogger({
      apiKey,
      projectName: process.env.BRAINTRUST_PROJECT_NAME?.trim() || "DSEmailAgent",
      asyncFlush: false
    })
  : undefined;

if (braintrustLogger && !globalThis.__braintrustAgentsConfigured) {
  addTraceProcessor(new OpenAIAgentsTraceProcessor({ logger: braintrustLogger }));
  globalThis.__braintrustAgentsConfigured = true;
}

import { fileSearchTool, Agent, type AgentInputItem, Runner, withTrace } from "@openai/agents";
import { z } from "zod";

const DeliverableSentenceSchema = z.object({
  reference_id: z.string(),
  source_sentence: z.string(),
  email_sentence: z.string()
});

const DaveOutputSchema = z.object({
  sentences: z.array(DeliverableSentenceSchema).max(2)
});

const OfferSelectionSchema = z.object({
  reference_id: z.string(),
  offer_title: z.string(),
  source_text: z.string(),
  email_summary: z.string()
});

const DavinaOutputSchema = z.object({
  selected_offer: OfferSelectionSchema
});

const DavidoffOutputSchema = z.object({
  angle: z.string(),
  subject: z.string(),
  email_body: z.string(),
  selected_offer_summary: z.string(),
  selected_project_summary: z.string(),
  mailbox_hint: z.string(),
  confidence: z.number(),
  needs_review: z.boolean()
});

export type WorkflowInput = { input_as_text: string };

export type WorkflowResult = {
  deliverables_agent_output: z.infer<typeof DaveOutputSchema>;
  offers_agent_output: z.infer<typeof DavinaOutputSchema>;
  composer_output: z.infer<typeof DavidoffOutputSchema>;
};

function cleanEnv(value: string | undefined, fallback?: string): string {
  const cleaned = value?.trim();
  if (cleaned) {
    return cleaned;
  }

  if (fallback) {
    return fallback;
  }

  throw new Error("Missing required environment variable.");
}

const deliverablesVectorStoreId = cleanEnv(
  process.env.OPENAI_DELIVERABLES_VECTOR_STORE_ID,
  "vs_69dcf75c5fe48191b238db51b0c16440"
);
const offersVectorStoreId = cleanEnv(
  process.env.OPENAI_PROJECTS_VECTOR_STORE_ID,
  "vs_69dcf7796fe88191896d77ca486230e8"
);
const workflowId = cleanEnv(
  process.env.OPENAI_WORKFLOW_ID,
  "wf_69cca6c89b848190b5681ecf9fa28c0e08f9ed130c5ffb75"
);

const fileSearch = fileSearchTool([deliverablesVectorStoreId]);
const fileSearch1 = fileSearchTool([offersVectorStoreId]);

const dave = new Agent({
  name: "Dave",
  instructions: `You are David, the deliverables proof selector for outbound email.

You will receive lead details such as job title, industry, company size, company name, and sometimes a company description.

Your job is to search the DELIVERABLES vector store and DUMMYDELIVERABLES.json and return up to 2 relevant proof sentences that could support an outbound email.

Rules:
1. Only use content explicitly present in the knowledge base.
2. Do not invent facts, clients, sectors, outcomes, or deliverables.
3. Do not merge details from different records into one sentence.
4. Only make minimal edits for grammar, tense, pronouns, or email fit.
5. Each sentence must map to exactly one source record.
6. Cite the exact \`reference_id\` for every sentence.
7. Prefer records matching the lead's industry, company type, stakeholder type, or likely business challenge.
8. If there is no exact match, use the closest credible match and preserve the original meaning.
9. Keep outputs concise and useful for a composer agent.
10. Return at most 2 sentences.

Output format:
{
  "sentences": [
    {
      "reference_id": "DS-DELIV-001",
      "source_sentence": "<exact sentence from the knowledge base>",
      "email_sentence": "<same sentence or minimally edited version>"
    }
  ]
}`,
  model: "gpt-5-mini",
  tools: [fileSearch],
  outputType: DaveOutputSchema,
  modelSettings: {
    reasoning: {
      effort: "low",
      summary: "auto"
    },
    store: true
  }
});

const davina = new Agent({
  name: "Davina",
  instructions: `You are an offer selection and positioning agent for outbound email.

You will receive input parameters about a lead, such as Job Title, Industry, Company Size, Company Name, and sometimes a Company Description.

Your job is to search the OFFERS vector store and DUMMYOFFERS.json and select the single most relevant offer for this lead.

Rules:
1. You must only use content that is explicitly present in the knowledge base.
2. Do not invent services, deliverables, sectors, outcomes, guarantees, or capabilities.
3. Do not merge details from different records into one offer description.
4. You may make only minimal edits for grammar, tense, pronouns, or email fit. Do not change the factual meaning.
5. The selected offer must map to exactly one source record.
6. Cite the exact \`reference_id\` of the source record used.
7. Prefer offers that match the lead's industry, company type, stakeholder type, or likely business challenge.
8. If there is no exact match, use the closest credible match from the knowledge base rather than returning nothing.
9. If using a closest credible match, keep the original meaning and do not overstate similarity.
10. Never cite a record unless the selected offer came from that exact record.
11. Prefer commercially practical offers such as reporting, automation, CRM improvement, dashboards, workflow improvement, or data cleanup where relevant.
12. Only choose one offer.

Output format:
{
  "selected_offer": {
    "reference_id": "DS-OFFER-001",
    "offer_title": "<title from the knowledge base>",
    "source_text": "<exact text from the knowledge base>",
    "email_summary": "<same text or minimally edited version for email use>"
  }
}`,
  model: "gpt-5-mini",
  tools: [fileSearch1],
  outputType: DavinaOutputSchema,
  modelSettings: {
    reasoning: {
      effort: "low",
      summary: "auto"
    },
    store: true
  }
});

const davidoff = new Agent({
  name: "Davidoff",
  instructions: `You are the final outbound email composer.

You will receive:
1. lead context
2. Davina's selected offer
3. David's selected deliverable sentences

Your job is to write one concise cold email using the selected offer as the main message and the selected deliverable sentence(s) as supporting proof.

Rules:
1. The offer is the main message.
2. The deliverable sentence(s) are supporting proof only.
3. Do not invent facts, outcomes, clients, sectors, metrics, or capabilities.
4. Only use the offer and deliverable material provided in the inputs.
5. Do not turn the message into a case study dump.
6. Keep the email body between 80 and 140 words.
7. Use at most 3 short paragraphs.
8. Use one CTA only.
9. Tone should be direct, calm, natural, and commercially sensible.
10. If the inputs are weak, mismatched, or low-confidence, reflect that in \`needs_review\`.
11. Preserve the factual meaning of any supporting proof used.

Output format:
{
  "angle": "<short description of the email angle>",
  "subject": "<email subject line>",
  "email_body": "<final email body>",
  "selected_offer_summary": "<summary of the chosen offer actually used>",
  "selected_project_summary": "<summary of the chosen deliverable proof actually used>",
  "mailbox_hint": "<optional mailbox/persona hint if useful>",
  "confidence": 0.0,
  "needs_review": false
}`,
  model: "gpt-5.4",
  outputType: DavidoffOutputSchema,
  modelSettings: {
    reasoning: {
      effort: "medium",
      summary: "auto"
    },
    store: true
  }
});

export const runWorkflow = async (workflow: WorkflowInput): Promise<WorkflowResult> => {
  return withTrace("Dave", async () => {
    const conversationHistory: AgentInputItem[] = [
      { role: "user", content: [{ type: "input_text", text: workflow.input_as_text }] }
    ];

    const runner = new Runner({
      traceMetadata: {
        __trace_source__: "agent-builder",
        workflow_id: workflowId
      }
    });

    const daveResultTemp = await runner.run(dave, [...conversationHistory]);
    conversationHistory.push(...daveResultTemp.newItems.map((item) => item.rawItem));

    if (!daveResultTemp.finalOutput) {
      throw new Error("Dave result is undefined");
    }

    const davinaResultTemp = await runner.run(davina, [...conversationHistory]);
    conversationHistory.push(...davinaResultTemp.newItems.map((item) => item.rawItem));

    if (!davinaResultTemp.finalOutput) {
      throw new Error("Davina result is undefined");
    }

    const davidoffResultTemp = await runner.run(davidoff, [...conversationHistory]);
    conversationHistory.push(...davidoffResultTemp.newItems.map((item) => item.rawItem));

    if (!davidoffResultTemp.finalOutput) {
      throw new Error("Davidoff result is undefined");
    }

    return {
      deliverables_agent_output: daveResultTemp.finalOutput,
      offers_agent_output: davinaResultTemp.finalOutput,
      composer_output: davidoffResultTemp.finalOutput
    };
  });
};

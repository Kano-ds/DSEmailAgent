import { fileSearchTool, Agent, Runner, withTrace } from "@openai/agents";
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

function buildSelectorPrompt(leadText: string): string {
  return [
    "Lead context:",
    leadText,
    "",
    "Select only approved dataset rows that best match this lead.",
    "Pay close attention to the actual business problem, industry, company type, and whether the lead sounds more like a reporting, automation, CRM, retail data, marketing data, or comment-analysis fit."
  ].join("\n");
}

function buildComposerPrompt(
  leadText: string,
  offer: z.infer<typeof OfferSelectionSchema>,
  proofs: z.infer<typeof DaveOutputSchema>
): string {
  const payload = {
    lead_context: leadText,
    selected_offer: offer,
    selected_proof_sentences: proofs.sentences
  };

  return JSON.stringify(payload, null, 2);
}

const deliverablesVectorStoreId = cleanEnv(
  process.env.OPENAI_DELIVERABLES_VECTOR_STORE_ID,
  "vs_69de40e162548191a860793bca6a43db"
);
const offersVectorStoreId = cleanEnv(
  process.env.OPENAI_PROJECTS_VECTOR_STORE_ID,
  "vs_69de40b8596c8191a1b12ffadca5b94a"
);
const workflowId = cleanEnv(
  process.env.OPENAI_WORKFLOW_ID,
  "wf_69cca6c89b848190b5681ecf9fa28c0e08f9ed130c5ffb75"
);

const proofSearch = fileSearchTool([deliverablesVectorStoreId]);
const offerSearch = fileSearchTool([offersVectorStoreId]);

const dave = new Agent({
  name: "Dave",
  instructions: `You are David, the proof sentence curator for outbound email.

You must search the case study / deliverables knowledge base for approved exact proof sentences.

The dataset is sentence-first. Each record is already an approved reusable sentence block.

Rules:
1. Return up to 2 rows only.
2. Prefer records that best match the lead's industry, stakeholder, business problem, and company type.
3. Use only exact sentences that exist in the knowledge base.
4. source_sentence must be copied exactly from the chosen record.
5. email_sentence must either equal source_sentence or contain only minimal polish for pronouns, tense, or grammar.
6. Do not invent, merge, or expand claims.
7. If no strong match exists, choose the closest credible sentence and lower fit implicitly by selecting conservative proof.
8. Never paraphrase beyond minimal polish.
9. Prefer proof that matches the specific business problem first, then the industry.
10. Prefer operationally believable proof over flashy but vague proof.
11. Avoid selecting two sentences that say almost the same thing.

Return JSON only.`,
  model: "gpt-5-mini",
  tools: [proofSearch],
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
  instructions: `You are Davina, the offer sentence curator for outbound email.

You must search the offers knowledge base for a single approved commercial sentence that best fits the lead.

The dataset is sentence-first. Each record is already an approved reusable sentence block.

Rules:
1. Select exactly one primary offer row.
2. Prefer sentence_type values such as offer_core or offer_delivery over CTA-only rows.
3. Use only exact sentences that exist in the knowledge base.
4. source_text must be copied exactly from the chosen record.
5. email_summary must either equal source_text or contain only minimal polish for pronouns, tense, or grammar.
6. Do not invent, merge, or expand claims.
7. Keep offer_title concise and derived from the selected row's commercial meaning, not a new promise.
8. reference_id must be the exact selected row ID.
9. Match the offer to the concrete problem in the lead context, not just the industry.
10. Prefer broader diagnostic or cleanup offers when the problem is messy or ambiguous.
11. Prefer specific offers like Power BI, CRM rebuild, retail data reporting, marketing data reporting, automation, or comment analysis when the lead context clearly points there.

Return JSON only.`,
  model: "gpt-5-mini",
  tools: [offerSearch],
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
  instructions: `You are the final outbound email stitcher.

You will receive:
1. lead context
2. one approved offer sentence
3. up to two approved proof sentences

Your job is to assemble a concise cold email that is mostly made from those curated sentences.

Rules:
1. Prefer preserving the approved offer and proof wording exactly.
2. You may only do minimal polish: grammar fixes, pronoun changes, tense alignment, light connective wording, and paragraph shaping.
3. Do not invent facts, outcomes, clients, sectors, metrics, capabilities, or promises.
4. Do not materially paraphrase the offer or proof claims.
5. Keep the email body between 80 and 140 words.
6. Use at most 3 short paragraphs.
7. Use one CTA only.
8. If the selected sentences fit poorly together, set needs_review to true.
9. selected_offer_summary must reflect the approved offer text actually used.
10. selected_project_summary must reflect the proof sentence text actually used.
11. Sound like a practical consultancy, not a generic sales email.
12. Do not say "I saw" or claim you observed internal problems unless the lead context explicitly states them.
13. If the lead context names a concrete problem, mirror it directly and simply.
14. Keep the proof as supporting evidence, not the centre of the email.
15. Prefer one sharp commercial idea over stacking multiple capabilities together.
16. The CTA should be low-pressure and natural, for example offering to share how you would approach it or compare notes briefly.
17. Avoid hype, avoid vague transformation language, and avoid sounding like a template.

Return JSON only.`,
  model: "gpt-5-mini",
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
  return withTrace("CuratedEmailWorkflow", async () => {
    const selectorPrompt = buildSelectorPrompt(workflow.input_as_text);
    const runner = new Runner({
      traceMetadata: {
        __trace_source__: "agent-builder",
        workflow_id: workflowId
      }
    });

    const proofResult = await runner.run(dave, selectorPrompt);
    if (!proofResult.finalOutput) {
      throw new Error("Dave result is undefined");
    }

    const offerResult = await runner.run(davina, selectorPrompt);
    if (!offerResult.finalOutput) {
      throw new Error("Davina result is undefined");
    }

    const composerPrompt = buildComposerPrompt(
      workflow.input_as_text,
      offerResult.finalOutput.selected_offer,
      proofResult.finalOutput
    );

    const composerResult = await runner.run(davidoff, composerPrompt);
    if (!composerResult.finalOutput) {
      throw new Error("Davidoff result is undefined");
    }

    return {
      deliverables_agent_output: proofResult.finalOutput,
      offers_agent_output: offerResult.finalOutput,
      composer_output: composerResult.finalOutput
    };
  });
};

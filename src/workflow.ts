import { Agent, Runner, withTrace, fileSearchTool, type AgentInputItem } from "@openai/agents";
import { z } from "zod";

const SourceSentenceSchema = z.object({
  reference_id: z.string(),
  source_sentence: z.string(),
  email_sentence: z.string()
});

const CaseStudySelectionSchema = z.object({
  sentences: z.array(SourceSentenceSchema).min(1).max(2)
});

const FinalEmailSchema = z.object({
  subject: z.string(),
  email_body: z.string(),
  rationale: z.string().optional()
});

export type CaseStudySelection = z.infer<typeof CaseStudySelectionSchema>;
export type FinalEmailOutput = z.infer<typeof FinalEmailSchema>;

export type WorkflowInput = {
  input_as_text: string;
};

export type WorkflowResult = {
  offers_agent_output: CaseStudySelection;
  projects_agent_output: CaseStudySelection;
  final_email_output: FinalEmailOutput;
};

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

const deliverablesVectorStoreId = requireEnv("OPENAI_DELIVERABLES_VECTOR_STORE_ID");
const projectsVectorStoreId = requireEnv("OPENAI_PROJECTS_VECTOR_STORE_ID");
const workflowId = process.env.OPENAI_WORKFLOW_ID ?? "local-dev-workflow";

const fileSearchDeliverables = fileSearchTool([deliverablesVectorStoreId], {
  maxNumResults: 5,
  includeSearchResults: true
});

const fileSearchProjects = fileSearchTool([projectsVectorStoreId], {
  maxNumResults: 5,
  includeSearchResults: true
});

const dave = new Agent({
  name: "Dave",
  instructions: `You are a marketing case study curator/compiler.

You will receive input parameters about a lead, such as Job Title, Industry, Company Size, Company Name, and sometimes a Company Description.

Your job is to search the DELIVERABLES vector store and select up to TWO relevant deliverable sentences.

Rules:
1. You must only use content that is explicitly present in the knowledge base.
2. Do not invent facts, clients, sectors, outcomes, or deliverables.
3. Do not merge details from different records into one sentence.
4. You may make only minimal edits for grammar, tense, pronouns, or email fit. Do not change the factual meaning.
5. Every output sentence must map to exactly one source record.
6. After each sentence, cite the exact reference_id of the source record used.
7. Prefer records that match the lead's industry, company type, stakeholder type, or likely business challenge.
8. If there is no exact match, use the closest credible match from the knowledge base rather than returning nothing.
9. If using a closest credible match, keep the original meaning and do not overstate similarity.
10. Never cite a record unless the sentence came from that exact record.

Return only structured output. If no strong match exists, return the 1 or 2 closest credible sentences instead of an empty array, as long as they are factually preserved and correctly cited.`,
  model: "gpt-4.1",
  tools: [fileSearchDeliverables],
  outputType: CaseStudySelectionSchema,
  modelSettings: {
    temperature: 0.5,
    topP: 1,
    maxTokens: 2048,
    store: true
  }
});

const davina = new Agent({
  name: "Davina",
  instructions: `Important:
You may see previous assistant messages in the workflow context.
Ignore any previous agent outputs completely.
Use only the original lead input and your own file search results.
Do not reuse, paraphrase, or align to another agent's answer.

You are a marketing case study curator/compiler.

You will receive input parameters about a lead, such as Job Title, Industry, Company Size, Company Name, and sometimes a Company Description.

Your job is to search the PREVIOUS PROJECTS vector store and select up to TWO relevant project or deliverable sentences.

Rules:
1. You must only use content that is explicitly present in the knowledge base.
2. Do not invent facts, clients, sectors, outcomes, or deliverables.
3. Do not merge details from different records into one sentence.
4. You may make only minimal edits for grammar, tense, pronouns, or email fit. Do not change the factual meaning.
5. Every output sentence must map to exactly one source record.
6. After each sentence, cite the exact reference_id of the source record used.
7. Prefer records that match the lead's industry, company type, stakeholder type, or likely business challenge.
8. If there is no exact match, use the closest credible match from the knowledge base rather than returning nothing.
9. If using a closest credible match, keep the original meaning and do not overstate similarity.
10. Never cite a record unless the sentence came from that exact record.

Return only structured output. If no strong match exists, return the 1 or 2 closest credible sentences instead of an empty array, as long as they are factually preserved and correctly cited.`,
  model: "gpt-5.4",
  tools: [fileSearchProjects],
  outputType: CaseStudySelectionSchema,
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
  instructions: `You are the final email composer.

Your job is to take:
- the lead context
- the Projects Agent output
- the Offers Agent output

and produce one complete cold email that uses both.

You are not choosing between the two agents.
You are combining them into one coherent email.

Objective:
- Write a short, natural, commercially sensible cold email.
- Use the Offers Agent output to define what we should talk about.
- Use the Projects Agent output to support that offer with relevant proof or precedent.
- Make the email feel tailored to the lead.

Return only structured output.`,
  model: "gpt-5.4",
  outputType: FinalEmailSchema,
  modelSettings: {
    reasoning: {
      effort: "low",
      summary: "auto"
    },
    store: true
  }
});

export async function runWorkflow(workflow: WorkflowInput): Promise<WorkflowResult> {
  return withTrace("Cold Email Workflow", async () => {
    const runner = new Runner({
      traceMetadata: {
        __trace_source__: "agent-builder",
        workflow_id: workflowId
      }
    });

    const baseInput: AgentInputItem[] = [
      {
        role: "user",
        content: [{ type: "input_text", text: workflow.input_as_text }]
      }
    ];

    const [daveResultTemp, davinaResultTemp] = await Promise.all([
      runner.run(dave, baseInput),
      runner.run(davina, baseInput)
    ]);

    if (!daveResultTemp.finalOutput) {
      throw new Error("Dave result is undefined");
    }

    if (!davinaResultTemp.finalOutput) {
      throw new Error("Davina result is undefined");
    }

    const finalInput: AgentInputItem[] = [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: JSON.stringify(
              {
                lead: workflow.input_as_text,
                offers_agent_output: daveResultTemp.finalOutput,
                projects_agent_output: davinaResultTemp.finalOutput
              },
              null,
              2
            )
          }
        ]
      }
    ];

    const davidoffResultTemp = await runner.run(davidoff, finalInput);

    if (!davidoffResultTemp.finalOutput) {
      throw new Error("Davidoff result is undefined");
    }

    return {
      offers_agent_output: daveResultTemp.finalOutput,
      projects_agent_output: davinaResultTemp.finalOutput,
      final_email_output: davidoffResultTemp.finalOutput
    };
  });
}


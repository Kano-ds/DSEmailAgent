import type { VercelRequest, VercelResponse } from "@vercel/node";
import "dotenv/config";
import "../src/braintrust.js";
import { runWorkflow } from "../src/workflow.js";

type LeadRecord = Record<string, unknown>;

type RequestBody = {
  input_as_text?: string;
  lead?: LeadRecord;
};

const preferredLeadKeys = [
  "firstname",
  "lastname",
  "company",
  "jobtitle",
  "industry",
  "website",
  "company_summary"
];

function buildLeadText(lead: LeadRecord): string {
  const prioritizedEntries = preferredLeadKeys
    .filter((key) => key in lead)
    .map((key) => [key, lead[key]] as const);

  const remainingEntries = Object.entries(lead).filter(
    ([key]) => !preferredLeadKeys.includes(key)
  );

  return [...prioritizedEntries, ...remainingEntries]
    .filter(([, value]) => value !== undefined && value !== null && `${value}`.trim() !== "")
    .map(([key, value]) => `${key}: ${value}`)
    .join(", ");
}

function getInputText(body: RequestBody): string {
  if (typeof body.input_as_text === "string" && body.input_as_text.trim()) {
    return body.input_as_text.trim();
  }

  if (body.lead && typeof body.lead === "object") {
    const leadText = buildLeadText(body.lead);
    if (leadText) {
      return leadText;
    }
  }

  throw new Error("Provide either 'input_as_text' or a non-empty 'lead' object.");
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed. Use POST." });
  }

  try {
    const body = (req.body ?? {}) as RequestBody;
    const input_as_text = getInputText(body);
    const result = await runWorkflow({ input_as_text });

    return res.status(200).json({
      status: "ok",
      input_as_text,
      ...result
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return res.status(400).json({ status: "error", error: message });
  }
}

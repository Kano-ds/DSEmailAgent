# DSEmailAgent

Curated-sentence OpenAI Agents SDK workflow for outbound cold email composition from two knowledge sources:

- `Davina`: selects one approved commercial offer sentence from the offers vector store
- `Dave`: selects up to two approved proof sentences from the case-study / deliverables vector store
- `Davidoff`: stitches those approved sentences into a short email with minimal polish only

## Setup

1. Copy `.env.example` to `.env`
2. Set `OPENAI_API_KEY`
3. Confirm the vector store IDs are correct
4. Install dependencies:

```bash
npm install
```

## Run

Development:

```bash
npm run dev -- "Job Title: VP Marketing, Industry: SaaS, Company Size: 200-500, Company Name: ExampleCo"
```

Build and run:

```bash
npm run build
npm start -- "Job Title: VP Marketing, Industry: SaaS, Company Size: 200-500, Company Name: ExampleCo"
```

## Curated Dataset Templates

This workflow expects sentence-first datasets rather than long descriptive records.

Template files:

- `data-templates/offers-curated-template.csv`
- `data-templates/case-studies-curated-template.csv`

Recommended authoring pattern:

- one approved sentence per row
- stable `reference_id` per row
- useful tags for industry, role, company type, and problem
- exact reusable text in `exact_sentence`

After filling the templates, upload them into your vector stores and set the matching environment variable IDs in Vercel.

## Deploy To Vercel

This repo now includes a Vercel serverless endpoint:

`POST /api/run-email-agent`

Request body options:

```json
{
  "input_as_text": "Job Title: VP Marketing, Industry: SaaS, Company Size: 200-500, Company Name: ExampleCo"
}
```

or

```json
{
  "lead": {
    "firstname": "Jane",
    "jobtitle": "VP Marketing",
    "industry": "SaaS",
    "company": "ExampleCo",
    "company_summary": "B2B software company"
  }
}
```

Example response:

```json
{
  "status": "ok",
  "input_as_text": "firstname: Jane, company: ExampleCo, jobtitle: VP Marketing, industry: SaaS, company_summary: B2B software company",
  "offers_agent_output": {
    "selected_offer": {
      "reference_id": "OFF-PBI-001",
      "offer_title": "Power BI workspace setup",
      "source_text": "We can set up your Power BI workspace, build your first reports and train your team in as little as two weeks.",
      "email_summary": "We can set up your Power BI workspace, build your first reports and train your team in as little as two weeks."
    }
  },
  "deliverables_agent_output": {
    "sentences": [
      {
        "reference_id": "CS-PBI-001",
        "source_sentence": "We built a Power BI reporting suite that gave the leadership team a single view across sales, stock and operations.",
        "email_sentence": "We built a Power BI reporting suite that gave the leadership team a single view across sales, stock and operations."
      }
    ]
  },
  "composer_output": {
    "angle": "Power BI setup with proof-led support",
    "subject": "Power BI setup for ExampleCo",
    "email_body": "Example email body",
    "selected_offer_summary": "We can set up your Power BI workspace, build your first reports and train your team in as little as two weeks.",
    "selected_project_summary": "We built a Power BI reporting suite that gave the leadership team a single view across sales, stock and operations.",
    "mailbox_hint": "operations",
    "confidence": 0.82,
    "needs_review": false
  }
}
```

Vercel setup:

1. Import the GitHub repo into Vercel.
2. Add environment variables:
   - `OPENAI_API_KEY`
   - `OPENAI_DELIVERABLES_VECTOR_STORE_ID` for the curated case-study / deliverables dataset
   - `OPENAI_PROJECTS_VECTOR_STORE_ID` for the curated offers dataset
   - `OPENAI_WORKFLOW_ID` (optional)
3. Deploy.
4. Call the deployed URL from Power Automate with an HTTP `POST`.

## Notes

- The workflow uses structured outputs with Zod schemas instead of raw JSON strings.
- Vector store IDs are pulled from environment variables, not hardcoded in code.
- The endpoint contract remains stable for Power Automate, but the internals are now data-first and curation-led.
- The final composer is instructed to do minimal polish only, not creative claim generation.

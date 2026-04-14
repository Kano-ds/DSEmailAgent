# DSEmailAgent

Baseline OpenAI Agents SDK project for generating cold emails from two knowledge sources:

- `Dave`: finds relevant offer or deliverable proof points from the deliverables vector store
- `Davina`: finds relevant project proof points from the previous projects vector store
- `Davidoff`: combines both outputs into one cold email

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
  "input_as_text": "firstname: Jane, jobtitle: VP Marketing, industry: SaaS, company: ExampleCo, company_summary: B2B software company",
  "offers_agent_output": {
    "sentences": []
  },
  "projects_agent_output": {
    "sentences": []
  },
  "final_email_output": {
    "subject": "Example subject",
    "email_body": "Example email body"
  }
}
```

Vercel setup:

1. Import the GitHub repo into Vercel.
2. Add environment variables:
   - `OPENAI_API_KEY`
   - `OPENAI_DELIVERABLES_VECTOR_STORE_ID`
   - `OPENAI_PROJECTS_VECTOR_STORE_ID`
   - `OPENAI_WORKFLOW_ID` (optional)
3. Deploy.
4. Call the deployed URL from Power Automate with an HTTP `POST`.

## Notes

- The workflow uses structured outputs with Zod schemas instead of raw JSON strings.
- Vector store IDs are pulled from environment variables, not hardcoded in code.
- The current baseline assumes your retrieval data is already loaded into the two OpenAI vector stores.
- If you also need local JSON files like `DUMMYDELIVERABLES.json` or `DUMMYPROJECTS.json`, add them later as either file-search content or local tools.

import "dotenv/config";
import { runWorkflow } from "./workflow.js";

async function main() {
  const input = process.argv.slice(2).join(" ").trim();

  if (!input) {
    throw new Error("Provide the lead context as a CLI argument.");
  }

  const result = await runWorkflow({ input_as_text: input });
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});


import "dotenv/config";
import { runIndustryNewsPulse } from "@/lib/scheduler/industryNewsPulse";

async function main() {
  const result = await runIndustryNewsPulse();
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

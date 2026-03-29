import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
  console.error("Missing env vars");
  process.exit(1);
}

const client = createClient(supabaseUrl, serviceKey);

const { data, error } = await client
  .from("scoreboard_metrics")
  .select("*")
  .limit(1);

if (error) {
  console.error("Supabase error:", error);
  process.exit(1);
}

console.log("Sample row:", data);

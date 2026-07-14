import { createClient } from "@supabase/supabase-js";
import { createRequire } from "module";

const require = createRequire(import.meta.url);

try {
  require("server-only");
} catch {
  // "server-only" throws outside the Next.js server runtime; swallow during local tests.
}

export function getSupabaseServerClient() {
  const env = process.env;
  const supabaseUrl = env["NEXT_PUBLIC_SUPABASE_URL"] ?? env["REACT_APP_SUPABASE_URL"];
  const supabaseServiceRoleKey = env["SUPABASE_SERVICE_ROLE_KEY"];

  if (!supabaseUrl) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
  if (!supabaseServiceRoleKey) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");

  return createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
}

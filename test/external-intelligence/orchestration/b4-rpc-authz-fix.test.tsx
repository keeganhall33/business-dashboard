import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const MIGRATION = "supabase/migrations/20260806152500_external_intelligence_b4_rpc_authz_fix.sql";

test("b4 RPC auth fix: uses PostgREST JWT role, not session_user", () => {
  const raw = fs.readFileSync(path.resolve(process.cwd(), MIGRATION), "utf8");

  // Must not authorize using session_user/current_user.
  assert.ok(!raw.includes("session_user is distinct"));
  assert.ok(!raw.includes("current_user"));

  // Must read JWT role from request settings.
  assert.match(raw, /current_setting\('request\.jwt\.claim\.role', true\)/);
  assert.match(raw, /current_setting\('request\.jwt\.claims', true\)/);

  // Must fail closed with stable SQLSTATE/message.
  assert.match(raw, /errcode\s*=\s*'42501'/);
  assert.match(raw, /message\s*=\s*'unauthorized'/);

  // Must preserve SECURITY DEFINER + safe search_path.
  assert.match(raw, /security definer/i);
  assert.match(raw, /set search_path = public/i);

  // Must preserve grants: fail-closed (PUBLIC/anon/authenticated revoked) and service_role allowed.
  // Note: postgres is the function owner and can execute by default; an explicit GRANT is not required.
  assert.match(raw, /revoke all on function public\.activate_external_intelligence_internal_orchestration_v1[\s\S]*from public;/);
  assert.match(raw, /revoke all on function public\.activate_external_intelligence_internal_orchestration_v1[\s\S]*from anon;/);
  assert.match(raw, /revoke all on function public\.activate_external_intelligence_internal_orchestration_v1[\s\S]*from authenticated;/);
  assert.match(raw, /grant execute on function public\.activate_external_intelligence_internal_orchestration_v1[\s\S]*to service_role;/);

  assert.match(raw, /revoke all on function public\.disable_external_intelligence_internal_orchestration_v1[\s\S]*from public;/);
  assert.match(raw, /revoke all on function public\.disable_external_intelligence_internal_orchestration_v1[\s\S]*from anon;/);
  assert.match(raw, /revoke all on function public\.disable_external_intelligence_internal_orchestration_v1[\s\S]*from authenticated;/);
  assert.match(raw, /grant execute on function public\.disable_external_intelligence_internal_orchestration_v1[\s\S]*to service_role;/);
});

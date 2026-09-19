import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

test("global workspace navigation has its own centered row beneath the logo header", () => {
  const source = fs.readFileSync(path.join(process.cwd(), "src/app/(app)/layout.tsx"), "utf8");

  assert.match(source, /aria-label="Keegan Hall dashboard"/);
  assert.match(source, /aria-label="Primary workspaces"/);
  assert.match(source, /lg:justify-center/);
  assert.match(source, /overflow-x-auto/);
  assert.match(source, /\[scrollbar-width:none\]/);

  const navStart = source.indexOf('aria-label="Primary workspaces"');
  const signOut = source.indexOf("Sign out");
  assert.ok(signOut >= 0 && navStart >= 0 && signOut < navStart, "Sign out should stay outside the workspace nav row");
});

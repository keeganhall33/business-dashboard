import test from "node:test";
import assert from "node:assert/strict";

import { splitTextByUrls } from "../src/lib/text/links.ts";

test("splitTextByUrls extracts http links", () => {
  const segments = splitTextByUrls("Check https://example.com for details");
  assert.deepEqual(segments, [
    { type: "text", value: "Check " },
    { type: "link", value: "https://example.com" },
    { type: "text", value: " for details" }
  ]);
});

test("splitTextByUrls normalizes www links", () => {
  const segments = splitTextByUrls("Visit www.keegan.art now");
  assert.equal(segments.length, 3);
  assert.equal(segments[1].type, "link");
  assert.equal(segments[1].value, "https://www.keegan.art");
});

import assert from "node:assert/strict";
import test from "node:test";

import React from "react";
import { renderToString } from "react-dom/server";

import { CapabilityRegistryCard } from "@/components/vertical-slice/CapabilityRegistryCard";
import {
  getCapabilityRegistryViewModelsV1,
  toCapabilityStatusViewModelV1
} from "@/lib/intelligence/capabilities/capability-status-view-model";

test("capability status view-model keeps absent lifecycle status explicit as UNKNOWN", () => {
  const vm = toCapabilityStatusViewModelV1({
    capability_id: "missing_registry_status",
    label: "Missing registry status",
    description: "Fixture row with intentionally absent lifecycle status."
  });

  assert.equal(vm.lifecycle_status, "UNKNOWN");
  assert.equal(vm.chip_label, "Unknown");
  assert.equal(vm.chip_tone, "zinc");
  assert.notEqual(vm.chip_tone, "emerald");
});

test("capability status view-model keeps BLOCKED_HUMAN_ACTION visibly distinct", () => {
  const vm = toCapabilityStatusViewModelV1({
    capability_id: "mailbox_connection",
    label: "Mailbox connection",
    description: "Requires approved human credential connection.",
    lifecycle_status: "BLOCKED_HUMAN_ACTION"
  });

  assert.equal(vm.lifecycle_status, "BLOCKED_HUMAN_ACTION");
  assert.equal(vm.chip_label, "Blocked: human action");
  assert.equal(vm.chip_tone, "sky");
});

test("capability registry card renders UNKNOWN and BLOCKED_HUMAN_ACTION read-only states", () => {
  const html = renderToString(
    React.createElement(CapabilityRegistryCard, {
      entries: [
        {
          capability_id: "unknown_capability",
          label: "Unknown capability",
          description: "No registry status present."
        },
        {
          capability_id: "blocked_capability",
          label: "Blocked capability",
          description: "Needs human action.",
          lifecycle_status: "BLOCKED_HUMAN_ACTION"
        }
      ]
    })
  );

  assert.match(html, /Unknown capability/);
  assert.match(html, /Unknown/);
  assert.match(html, /Blocked capability/);
  assert.match(html, /Blocked: human action/);
  assert.doesNotMatch(html, /Implemented \+ proven/);
});

test("capability registry view-model ordering is deterministic", () => {
  const ids = getCapabilityRegistryViewModelsV1([
    { capability_id: "z_capability", label: "Z", description: "Z", lifecycle_status: "PARTIAL" },
    { capability_id: "a_capability", label: "A", description: "A", lifecycle_status: "PARTIAL" }
  ]).map((item) => item.capability_id);

  assert.deepEqual(ids, ["a_capability", "z_capability"]);
});

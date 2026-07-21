import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { DashboardSection } from "@/components/dashboard/ui/DashboardSection";

function mockWindow() {
  const store = new Map<string, string>();
  const sessionStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => store.delete(key)
  };
  const matchMedia = () => ({ matches: false });
  globalThis.window = Object.assign(globalThis.window ?? {}, { sessionStorage, matchMedia }) as Window & typeof globalThis;
}

function renderSection(props: Partial<React.ComponentProps<typeof DashboardSection>> = {}) {
  mockWindow();
  let renderer: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(
      <DashboardSection title="Section" subtitle="Subtitle" {...props}>
        <p>Body content</p>
      </DashboardSection>
    );
  });
  return renderer!;
}

test("renders children when open by default", () => {
  const renderer = renderSection();
  const region = renderer.root.findByProps({ role: "region" });
  assert.ok(region.props.children);
  const button = renderer.root.findByType("button");
  assert.equal(button.props["aria-expanded"], true);
});

test("respects default collapsed state", () => {
  const renderer = renderSection({ defaultOpen: false });
  assert.equal(renderer.root.findByType("button").props["aria-expanded"], false);
  assert.equal(renderer.root.findAllByProps({ role: "region" }).length, 0);
});

test("toggles open state via header button", () => {
  const renderer = renderSection();
  const button = renderer.root.findByType("button");
  act(() => button.props.onClick());
  assert.equal(button.props["aria-expanded"], false);
  act(() => button.props.onClick());
  assert.equal(button.props["aria-expanded"], true);
});

test("persists state to session storage when storageKey provided", () => {
  mockWindow();
  let renderer: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(
      <DashboardSection title="Session" storageKey="section-cache">
        Content
      </DashboardSection>
    );
  });
  const button = renderer!.root.findByType("button");
  act(() => button.props.onClick());
  assert.equal(globalThis.window?.sessionStorage?.getItem("section-cache"), "closed");
});

test("exposes aria relationships", () => {
  const renderer = renderSection({ storageKey: "test-section" });
  const button = renderer.root.findByType("button");
  const region = renderer.root.findByProps({ role: "region" });
  assert.ok(typeof button.props.id === "string");
  assert.equal(region.props["aria-labelledby"], button.props.id);
  assert.equal(button.props["aria-controls"], region.props.id);
});

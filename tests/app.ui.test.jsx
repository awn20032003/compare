import React from "react";
import { test, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  cleanup,
  waitFor,
  fireEvent,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "../src/main.jsx";
import { parseInput, compare } from "../src/engine.js";
import { File as NodeFile } from "node:buffer";
class LocalWorker {
  terminated = false;
  async postMessage(data) {
    try {
      const a = await parseInput(data.inputs[0]),
        b = await parseInput(data.inputs[1]);
      const result = await compare(a, b, data.options);
      if (!this.terminated) this.onmessage({ data: { a, b, result } });
    } catch (error) {
      if (!this.terminated) this.onmessage({ data: { error: error.message } });
    }
  }
  terminate() {
    this.terminated = true;
  }
}
beforeEach(() => {
  vi.stubGlobal("Worker", LocalWorker);
  vi.stubGlobal("File", NodeFile);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
test("homepage and privacy dialog are keyboard accessible", async () => {
  const u = userEvent.setup();
  render(<App />);
  expect(screen.getByRole("heading", { name: "What changed?" })).toBeTruthy();
  expect(screen.getAllByRole("button", { name: "Choose file" })).toHaveLength(
    2,
  );
  await u.click(screen.getByRole("button", { name: "Private by design" }));
  expect(screen.getByRole("dialog")).toBeTruthy();
  await u.keyboard("{Escape}");
  expect(screen.queryByRole("dialog")).toBeNull();
});
test("document example produces real grounded changes and navigation", async () => {
  const u = userEvent.setup();
  render(<App />);
  await u.click(screen.getByRole("button", { name: "Document" }));
  await screen.findByRole("heading", { name: /changes found/ });
  expect(screen.getAllByText(/Monthly salary/).length).toBeGreaterThan(0);
  await u.click(screen.getByRole("button", { name: "Unified" }));
  await u.click(screen.getByRole("button", { name: "Next change" }));
  await u.click(screen.getByRole("button", { name: "Export report" }));
  expect(screen.getByRole("button", { name: "HTML report" })).toBeTruthy();
  expect(
    document.querySelectorAll(".print-report article").length,
  ).toBeGreaterThan(0);
  await u.click(screen.getByRole("button", { name: "New comparison" }));
  expect(screen.getByRole("heading", { name: "What changed?" })).toBeTruthy();
});
test("paste flow supports identical and empty contents", async () => {
  const u = userEvent.setup();
  render(<App />);
  for (let i = 0; i < 2; i++) {
    await u.click(screen.getAllByRole("button", { name: "paste content" })[i]);
    await u.click(screen.getByRole("button", { name: "Use this content" }));
  }
  await screen.findByRole("heading", { name: "No differences found." });
});
test("JSON originals expose expandable structure and filtering", async () => {
  const u = userEvent.setup();
  render(<App />);
  await u.click(screen.getByRole("button", { name: "Data" }));
  await screen.findByRole("heading", { name: "3 changes found" });
  await u.click(screen.getByRole("button", { name: "Originals" }));
  expect(screen.getAllByText("features").length).toBeGreaterThan(0);
  await u.selectOptions(
    screen.getByRole("combobox", { name: "Filter changes" }),
    "added",
  );
  expect(screen.getByText("No matching changes.")).toBeTruthy();
});
test("spreadsheet renders a real table and supports identity selection", async () => {
  const u = userEvent.setup();
  render(<App />);
  await u.click(screen.getByRole("button", { name: "Spreadsheet" }));
  await screen.findByRole("heading", { name: /table changes found/ });
  await u.selectOptions(
    screen.getByRole("combobox", { name: "Row matching column" }),
    "id",
  );
  await screen.findByText("Rows matched by id.");
  await u.click(screen.getByRole("button", { name: "Originals" }));
  expect(screen.getAllByRole("table")).toHaveLength(2);
});
test("folder changes drill down into files and return", async () => {
  const u = userEvent.setup();
  render(<App />);
  await u.click(screen.getByRole("button", { name: "Folder" }));
  await screen.findByRole("heading", { name: "3 files changed" });
  await u.click(screen.getByRole("button", { name: "Open comparison" }));
  await screen.findByRole("heading", { name: "1 changes found" });
  await u.click(screen.getByRole("button", { name: "Back to collection" }));
  await screen.findByRole("heading", { name: "3 files changed" });
});

import { parseInput, compare } from "./engine.js";
self.onmessage = async ({ data }) => {
  let inputIndex = 0;
  try {
    const progress = (message) => self.postMessage({ progress: message });
    const a = await parseInput(data.inputs[0], progress);
    inputIndex = 1;
    const b = await parseInput(data.inputs[1], progress);
    progress("Finding differences");
    const result = await compare(a, b, data.options, progress);
    self.postMessage({ result, a, b });
  } catch (e) {
    self.postMessage({
      error:
        e.name === "PasswordException"
          ? "This PDF needs a password to open."
          : e.message || "Unable to compare these files.",
      passwordIndex: e.name === "PasswordException" ? inputIndex : undefined,
    });
  }
};

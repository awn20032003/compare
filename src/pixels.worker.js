import { comparePixels } from "./pixels";
self.onmessage = ({ data }) => {
  const result = comparePixels(
    data.a,
    data.b,
    data.width,
    data.height,
    data.tolerance,
  );
  self.postMessage(result, [result.output.buffer]);
};

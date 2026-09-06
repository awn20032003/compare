export function comparePixels(a, b, width, height, tolerance = 15) {
  const output = new Uint8ClampedArray(width * height * 4),
    tile = 32,
    cols = Math.ceil(width / tile),
    rows = Math.ceil(height / tile),
    changedTiles = new Uint8Array(cols * rows);
  let count = 0;
  for (let i = 0; i < output.length; i += 4) {
    const changed =
      Math.abs(a[i] - b[i]) > tolerance ||
      Math.abs(a[i + 1] - b[i + 1]) > tolerance ||
      Math.abs(a[i + 2] - b[i + 2]) > tolerance ||
      Math.abs(a[i + 3] - b[i + 3]) > tolerance;
    if (changed) {
      count++;
      const p = i / 4;
      changedTiles[
        Math.floor(Math.floor(p / width) / tile) * cols +
          Math.floor((p % width) / tile)
      ] = 1;
    }
    output[i] = changed ? 232 : b[i] * 0.25 + 180;
    output[i + 1] = changed ? 86 : b[i + 1] * 0.25 + 180;
    output[i + 2] = changed ? 112 : b[i + 2] * 0.25 + 180;
    output[i + 3] = 255;
  }
  const regions = [];
  for (let i = 0; i < changedTiles.length; i++) {
    if (!changedTiles[i]) continue;
    const queue = [i];
    changedTiles[i] = 0;
    let minX = cols,
      minY = rows,
      maxX = 0,
      maxY = 0;
    for (let cursor = 0; cursor < queue.length; cursor++) {
      const pos = queue[cursor],
        x = pos % cols,
        y = Math.floor(pos / cols);
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
      for (const [nx, ny] of [
        [x - 1, y],
        [x + 1, y],
        [x, y - 1],
        [x, y + 1],
      ])
        if (
          nx >= 0 &&
          nx < cols &&
          ny >= 0 &&
          ny < rows &&
          changedTiles[ny * cols + nx]
        ) {
          changedTiles[ny * cols + nx] = 0;
          queue.push(ny * cols + nx);
        }
    }
    regions.push({
      x: minX * tile,
      y: minY * tile,
      width: Math.min(width, (maxX + 1) * tile) - minX * tile,
      height: Math.min(height, (maxY + 1) * tile) - minY * tile,
    });
  }
  return { output, count, regions };
}

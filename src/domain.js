function slide(board, direction) {
  if (!["LEFT", "RIGHT", "UP", "DOWN"].includes(direction))
    throw new Error("INVALID_DIRECTION");
  const out = Array(16).fill(0);
  let delta = 0n;
  for (let line = 0; line < 4; line++) {
    const indexes = Array.from({ length: 4 }, (_, i) =>
      direction === "LEFT"
        ? line * 4 + i
        : direction === "RIGHT"
          ? line * 4 + 3 - i
          : direction === "UP"
            ? i * 4 + line
            : (3 - i) * 4 + line,
    );
    const values = indexes.map((i) => board[i]).filter(Boolean),
      merged = [];
    for (let i = 0; i < values.length; i++) {
      if (values[i] === values[i + 1]) {
        const v = values[i] * 2;
        merged.push(v);
        delta += BigInt(v);
        i++;
      } else merged.push(values[i]);
    }
    indexes.forEach((index, i) => (out[index] = merged[i] || 0));
  }
  return { board: out, delta, changed: out.some((v, i) => v !== board[i]) };
}
function canMove(b) {
  return (
    b.some((v) => v === 0) ||
    b.some(
      (v, i) => (i % 4 < 3 && v === b[i + 1]) || (i < 12 && v === b[i + 4]),
    )
  );
}
function spawn(board, rng = Math.random) {
  const empty = board.map((v, i) => (v === 0 ? i : -1)).filter((i) => i >= 0);
  if (!empty.length) return;
  const index = empty[Math.floor(rng() * empty.length)];
  board[index] = rng() < 0.9 ? 2 : 4;
  return { row: Math.floor(index / 4), column: index % 4, value: board[index] };
}
module.exports = { slide, canMove, spawn };

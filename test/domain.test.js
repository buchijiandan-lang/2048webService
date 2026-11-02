const { test } = require("node:test");
const assert = require("node:assert/strict");
const { slide, canMove } = require("../src/domain");
test("merges each tile once and computes score", () => {
  const r = slide([2, 2, 2, 2, ...Array(12).fill(0)], "LEFT");
  assert.deepEqual(r.board.slice(0, 4), [4, 4, 0, 0]);
  assert.equal(r.delta, 8n);
  assert.deepEqual(
    slide([2, 2, 4, 0, ...Array(12).fill(0)], "RIGHT").board.slice(0, 4),
    [0, 0, 4, 4],
  );
});
test("vertical moves preserve orientation", () => {
  const b = [2, 0, 0, 0, 2, 0, 0, 0, ...Array(8).fill(0)];
  assert.equal(slide(b, "UP").board[0], 4);
  assert.equal(slide(b, "DOWN").board[12], 4);
});
test("no-op and lost board detection", () => {
  const b = [2, 0, 0, 0, ...Array(12).fill(0)];
  assert.equal(slide(b, "LEFT").changed, false);
  assert.equal(
    canMove([2, 4, 2, 4, 4, 2, 4, 2, 2, 4, 2, 4, 4, 2, 4, 2]),
    false,
  );
  assert.equal(canMove([2, 2, 2, 4, 4, 2, 4, 2, 2, 4, 2, 4, 4, 2, 4, 2]), true);
});

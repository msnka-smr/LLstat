import test from "node:test";
import assert from "node:assert/strict";
import { pushWithRebaseRetry } from "../scripts/lib/gitPush.mjs";

function fakeRun(failPushes) {
  const calls = [];
  let pushes = 0;
  const run = (cmd, args) => {
    calls.push([cmd, ...args].join(" "));
    if (args[0] === "push" && ++pushes <= failPushes) throw new Error("rejected: non-fast-forward");
  };
  run.calls = calls;
  return run;
}

test("пуш прошёл сразу — pull не нужен", () => {
  const run = fakeRun(0);
  pushWithRebaseRetry(run);
  assert.deepEqual(run.calls, ["git push"]);
});

test("пуш отклонён (кто-то успел запушить) — pull --rebase и повтор", () => {
  const run = fakeRun(1);
  pushWithRebaseRetry(run);
  assert.deepEqual(run.calls, ["git push", "git pull --rebase", "git push"]);
});

test("пуш отклоняется снова и снова — ошибка пробрасывается после лимита попыток", () => {
  const run = fakeRun(99);
  assert.throws(() => pushWithRebaseRetry(run, 3), /non-fast-forward/);
  assert.equal(run.calls.filter((c) => c === "git push").length, 3);
});

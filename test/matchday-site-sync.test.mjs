import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { MAP_POOL } from "../scripts/lib/matchday.mjs";

test("пул карт на сайте совпадает с пулом бота", () => {
  const html = readFileSync("docs/index.html", "utf8");
  const m = /var MATCHDAY_MAP_POOL = \[([^\]]*)\]/.exec(html);
  assert.ok(m, "на странице нет MATCHDAY_MAP_POOL");
  const onSite = [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
  assert.deepEqual(onSite, MAP_POOL);
});

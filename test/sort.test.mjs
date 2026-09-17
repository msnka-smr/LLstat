import test from "node:test";
import assert from "node:assert/strict";
import { sortRows } from "../scripts/lib/sort.mjs";

test("unqualified rows always sink below qualified ones", () => {
  const rows = [
    { name: "low-rated-qualified", isQualified: true, rating: 0.5 },
    { name: "high-rated-unqualified", isQualified: false, rating: 3.0 },
  ];
  const sorted = sortRows(rows, "rating", "desc");
  assert.equal(sorted[0].name, "low-rated-qualified");
  assert.equal(sorted[1].name, "high-rated-unqualified");
});

test("within a group, sorts by the chosen column descending", () => {
  const rows = [
    { name: "a", isQualified: true, rating: 1.1 },
    { name: "b", isQualified: true, rating: 1.5 },
    { name: "c", isQualified: true, rating: 0.9 },
  ];
  const sorted = sortRows(rows, "rating", "desc").map((r) => r.name);
  assert.deepEqual(sorted, ["b", "a", "c"]);
});

test("ascending direction is respected within a group", () => {
  const rows = [
    { name: "a", isQualified: true, rating: 1.1 },
    { name: "b", isQualified: true, rating: 1.5 },
  ];
  const sorted = sortRows(rows, "rating", "asc").map((r) => r.name);
  assert.deepEqual(sorted, ["a", "b"]);
});

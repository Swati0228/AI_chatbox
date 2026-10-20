import assert from "node:assert/strict";
import test from "node:test";

import { createVectorStore } from "../src/vectorStore.js";

// ---------------------------------------------------------------------------
// Vector store unit tests
// ---------------------------------------------------------------------------

test("add and size track inserted chunks", () => {
  const store = createVectorStore();
  assert.equal(store.size(), 0);
  store.add("hello world", [1, 0, 0], { source: "test.pdf" });
  store.add("another chunk", [0, 1, 0], { source: "test.pdf" });
  assert.equal(store.size(), 2);
});

test("search returns top-K results sorted by cosine similarity", () => {
  const store = createVectorStore();
  store.add("chunk A", [1, 0, 0], { source: "a.pdf" });
  store.add("chunk B", [0, 1, 0], { source: "b.pdf" });
  store.add("chunk C", [0, 0, 1], { source: "c.pdf" });

  // Query closest to chunk A ([1,0,0])
  const results = store.search([0.9, 0.1, 0.05], 3);

  assert.equal(results.length, 3);
  assert.equal(results[0].chunk, "chunk A");   // highest similarity
  assert.ok(results[0].score > results[1].score);
  assert.ok(results[1].score > results[2].score);
});

test("search with topK limits results", () => {
  const store = createVectorStore();
  for (let i = 0; i < 10; i++) {
    const vec = Array.from({ length: 10 }, (_, j) => (i === j ? 1 : 0));
    store.add(`chunk ${i}`, vec, {});
  }
  const results = store.search(Array(10).fill(0.1), 2);
  assert.equal(results.length, 2);
});

test("search on empty store returns empty array", () => {
  const store = createVectorStore();
  const results = store.search([1, 0, 0], 3);
  assert.deepEqual(results, []);
});

test("cosine similarity of identical vectors is 1", () => {
  const store = createVectorStore();
  store.add("identical", [3, 4, 0], {});
  const results = store.search([3, 4, 0], 1);
  assert.ok(Math.abs(results[0].score - 1) < 1e-6);
});

test("cosine similarity of orthogonal vectors is 0", () => {
  const store = createVectorStore();
  store.add("orthogonal", [1, 0], {});
  const results = store.search([0, 1], 1);
  assert.ok(Math.abs(results[0].score) < 1e-6);
});

test("metadata is preserved in search results", () => {
  const store = createVectorStore();
  const meta = { source: "policy.pdf", chunkIndex: 42 };
  store.add("some content", [1, 1, 1], meta);
  const results = store.search([1, 1, 1], 1);
  assert.deepEqual(results[0].metadata, meta);
});

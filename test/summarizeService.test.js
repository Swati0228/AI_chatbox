import assert from "node:assert/strict";
import test from "node:test";

import { createSummarizeService, DEFAULT_SYSTEM_PROMPT } from "../src/summarizeService.js";

test("chat initializes system prompt with highest priority system role in history", async () => {
  let request;
  const client = {
    responses: {
      create: async (input) => {
        request = input;
        return { output_text: "I can help you check your order tracking status." };
      },
    },
  };
  const service = createSummarizeService({ client, model: "test-model" });

  const result = await service.chat("Where is my pizza?");

  assert.equal(result, "I can help you check your order tracking status.");
  assert.equal(request.model, "test-model");
  assert.equal(request.store, false);

  // Sent history has 2 items on the first call:
  // 1. Role: 'system' (overarching instructions with highest priority)
  // 2. Role: 'user' (user's query)
  assert.equal(request.input.length, 2);
  assert.equal(request.input[0].role, "system");
  assert.equal(request.input[0].content, DEFAULT_SYSTEM_PROMPT);
  assert.equal(request.input[1].role, "user");
  assert.equal(request.input[1].content, "Where is my pizza?");

  // After completion, history also records the assistant reply
  const history = service.getHistory();
  assert.equal(history.length, 3);
  assert.equal(history[0].role, "system");
  assert.equal(history[1].role, "user");
  assert.equal(history[2].role, "assistant");
  assert.equal(history[2].content, "I can help you check your order tracking status.");
});

test("stream progressively yields deltas and stores the full response in history using dynamic string", async () => {
  let request;
  const client = {
    responses: {
      stream: (input) => {
        request = input;
        async function* generate() {
          yield { type: "response.output_text.delta", delta: "I can check " };
          yield { type: "response.output_text.delta", delta: "your refund " };
          yield { type: "response.output_text.delta", delta: "status." };
        }
        return generate();
      },
    },
  };

  const service = createSummarizeService({ client, model: "test-model" });
  const chunks = [];
  for await (const chunk of service.stream("Refund update?")) {
    chunks.push(chunk);
  }

  assert.deepEqual(chunks, ["I can check ", "your refund ", "status."]);
  const history = service.getHistory();
  assert.equal(history[history.length - 1].role, "assistant");
  assert.equal(history[history.length - 1].content, "I can check your refund status.");
});



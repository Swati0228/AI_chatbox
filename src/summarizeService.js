import OpenAI from "openai";

const DEFAULT_MODEL = "gpt-4o-mini";

export const DEFAULT_SYSTEM_PROMPT = `You are a customer support executive of our food delivery application called Tomato.
Respond to customer queries professionally.

Priority Instructions (System Role):
- Tone: If the customer is furious, angry, or has any issue, use empathetic phrases like "I understand your concern" or "I am sorry you have to go through this", and then solve the customer's query.
- Business Restriction: Only entertain requests strictly related to:
  1. Ordering food
  2. Refund queries
  3. Order tracking status
  4. Tomato company policy
- Out-of-Scope Requests: Do NOT respond to any request or question not related to Tomato's food delivery business. Politely refuse and guide the user back to food ordering, refunds, order tracking, or company policies.`;

export function createSummarizeService({
  client = new OpenAI(),
  model = process.env.OPENAI_MODEL || DEFAULT_MODEL,
  systemPrompt = DEFAULT_SYSTEM_PROMPT,
  history = [],
} = {}) {
  // System role has higher priority than user and assistant roles.
  // It is set at the start of history to govern the entire conversation.
  if (history.length === 0 && systemPrompt) {
    history.push({ role: "system", content: systemPrompt });
  }

  async function* stream(message) {
    // 1. Add user message to history
    history.push({ role: "user", content: message });

    // 2. Stream response from OpenAI using .stream() (or stream: true)
    let responseStream;
    if (typeof client.responses?.stream === "function") {
      responseStream = client.responses.stream({
        model,
        input: [...history],
        store: false,
      });
    } else {
      const res = await client.responses.create({
        model,
        input: [...history],
        stream: true,
        store: false,
      });

      // Handle async iterable stream or non-stream fallback (e.g. unit tests)
      if (res && res[Symbol.asyncIterator]) {
        responseStream = res;
      } else {
        const text = res?.output_text || "";
        history.push({ role: "assistant", content: text });
        yield text;
        return;
      }
    }

    // Dynamic string to accumulate chunks and update history
    let dynamicString = "";

    for await (const chunk of responseStream) {
      const delta =
        chunk?.type === "response.output_text.delta"
          ? chunk.delta
          : chunk?.delta ?? chunk?.choices?.[0]?.delta?.content ?? (typeof chunk === "string" ? chunk : "");

      if (delta) {
        dynamicString += delta;
        yield delta;
      }
    }

    if (!dynamicString) {
      throw new Error("OpenAI returned an empty response");
    }

    // 3. Add accumulated assistant reply to history
    history.push({ role: "assistant", content: dynamicString });
  }

  async function chat(message) {
    let dynamicString = "";
    for await (const chunk of stream(message)) {
      dynamicString += chunk;
    }
    return dynamicString;
  }

  return {
    stream,
    chat,
    chatStream: stream,
    summarize: chat,
    summarizeStream: stream,
    getHistory: () => history,
  };
}




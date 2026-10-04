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

  async function chat(message) {
    // 1. Add user message (clean user input, without polluting with repeated system instructions)
    history.push({ role: "user", content: message });

    // 2. Send conversation history (system role + turns) to the model
    const response = await client.responses.create({
      model,
      input: history,
      store: false,
    });

    if (!response.output_text) {
      throw new Error("OpenAI returned an empty response");
    }

    const output = response.output_text;

    // 3. Add assistant reply to history
    history.push({ role: "assistant", content: output });

    return output;
  }

  return {
    chat,
    summarize: chat, // Keep summarize as alias so existing code/tests work
    getHistory: () => history,
  };
}




import OpenAI from "openai";

const DEFAULT_MODEL = "gpt-4o-mini";

export function createSummarizeService({
  client = new OpenAI(),
  model = process.env.OPENAI_MODEL || DEFAULT_MODEL,
  history = [],
} = {}) {
  // history acts like private List<Message> history = new ArrayList<>(); in Java
  async function chat(message) {
    // 1. Add user message to history (equivalent to history.add(new UserMessage(message)))
    history.push({ role: "user", content: message });

    // 2. Send the conversation history to the model
    const response = await client.responses.create({
      model,
      input: history,
      store: false,
    });

    if (!response.output_text) {
      throw new Error("OpenAI returned an empty response");
    }

    const output = response.output_text;

    // 3. Add assistant reply to history (equivalent to history.add(new AssistantMessage(output)))
    history.push({ role: "assistant", content: output });

    return output;
  }

  return {
    chat,
    summarize: chat, // Keep summarize as alias so existing code/tests work
    getHistory: () => history,
  };
}


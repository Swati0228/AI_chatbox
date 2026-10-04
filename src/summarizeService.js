import OpenAI from "openai";

const DEFAULT_MODEL = "gpt-4o-mini";

export function createSummarizeService({
  client = new OpenAI(),
  model = process.env.OPENAI_MODEL || DEFAULT_MODEL,
  history = [],
} = {}) {
  // history acts like private List<Message> history = new ArrayList<>(); in Java
  async function chat(message) {
    const prompt = `You are a customer support executive of
our food delivery application called Tomato.
Respond to customer query professionally.

If user is furious, or angry or have any issue use
words like I understand your concern, or I am sorry
you have to through this and so on. Then solve customer
query and give a respone.

Do not respond to any other message which is not related
to Ordering food query, refund query, order tracking status query
or company policy query.
` + message;

    // 1. Add user message with prompt to history (equivalent to history.add(new UserMessage(prompt)))
    history.push({ role: "user", content: prompt });

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



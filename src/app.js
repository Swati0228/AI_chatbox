import express from "express";

export function createApp(summarizeService) {
  const chatFn = summarizeService?.chat || summarizeService?.summarize;
  if (typeof chatFn !== "function") {
    throw new TypeError("A chat or summarize service is required");
  }

  const app = express();
  app.use(express.text({ type: "*/*", limit: "100kb" }));

  // Chat endpoint
  app.post("/api/chat", async (request, response) => {
    const message = typeof request.body === "string" ? request.body : "";

    if (!message.trim()) {
      return response
        .status(400)
        .type("text/plain")
        .send("Message text is required.");
    }

    try {
      const reply = await chatFn.call(summarizeService, message);
      return response.type("text/plain").send(reply);
    } catch (error) {
      console.error("Failed to process message:", error);
      return response
        .status(500)
        .type("text/plain")
        .send("Unable to process the message.");
    }
  });

  // Backward-compatible endpoint for ticket summarizer
  app.post("/api/summarize", async (request, response) => {
    const ticket = typeof request.body === "string" ? request.body : "";

    if (!ticket.trim()) {
      return response
        .status(400)
        .type("text/plain")
        .send("Ticket text is required.");
    }

    try {
      const reply = await chatFn.call(summarizeService, ticket);
      return response.type("text/plain").send(reply);
    } catch (error) {
      console.error("Failed to summarize ticket:", error);
      return response
        .status(500)
        .type("text/plain")
        .send("Unable to summarize the ticket.");
    }
  });

  return app;
}


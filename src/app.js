import express from "express";

export function createApp(summarizeService) {
  const streamFn = summarizeService?.stream || summarizeService?.chatStream || summarizeService?.summarizeStream;
  const chatFn = summarizeService?.chat || summarizeService?.summarize;
  if (typeof streamFn !== "function" && typeof chatFn !== "function") {
    throw new TypeError("A chat or summarize service is required");
  }

  const app = express();
  app.use(express.text({ type: "*/*", limit: "100kb" }));

  async function handleRequest(input, response, errorMessage) {
    try {
      if (typeof streamFn === "function") {
        response.setHeader("Content-Type", "text/plain; charset=utf-8");
        response.setHeader("Transfer-Encoding", "chunked");
        const stream = streamFn.call(summarizeService, input);
        for await (const chunk of stream) {
          response.write(chunk);
        }
        return response.end();
      }

      const reply = await chatFn.call(summarizeService, input);
      return response.type("text/plain").send(reply);
    } catch (error) {
      console.error(errorMessage, error);
      if (!response.headersSent) {
        return response.status(500).type("text/plain").send(errorMessage);
      }
      return response.end();
    }
  }

  // Chat endpoint
  app.post("/api/chat", async (request, response) => {
    const message = typeof request.body === "string" ? request.body : "";

    if (!message.trim()) {
      return response
        .status(400)
        .type("text/plain")
        .send("Message text is required.");
    }

    return handleRequest(message, response, "Unable to process the message.");
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

    return handleRequest(ticket, response, "Unable to summarize the ticket.");
  });

  return app;
}


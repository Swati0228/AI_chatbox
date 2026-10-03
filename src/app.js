import express from "express";

export function createApp(summarizeService) {
  if (!summarizeService?.summarize) {
    throw new TypeError("A summarize service is required");
  }

  const app = express();
  app.use(express.text({ type: "*/*", limit: "100kb" }));

  app.post("/api/chat", async (request, response) => {
    const  message = typeof request.body === "string" ? request.body : "";

    if (!message.trim()) {
      return response
        .status(400)
        .type("text/plain")
        .send("Ticket text is required.");
    }

    try {
      const message = await summarizeService.summarize(message);
      return response.type("text/plain").send(message);
    } catch (error) {
      console.error("Failed to parse meesage:", error);
      return response
        .status(500)
        .type("text/plain")
        .send("Unable to parse the meesage.");
    }
  });

  return app;
}

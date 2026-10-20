import "dotenv/config";

import { createApp } from "./app.js";
import { createRagService } from "./ragService.js";

const port = Number(process.env.PORT || 8080);

// createRagService is async: it indexes all PDFs before the server starts
// accepting requests, so every query benefits from the full knowledge base.
const ragService = await createRagService();

const app = createApp(ragService);

app.listen(port, () => {
  console.log(`Node.js RAG-powered ticket summarizer listening on port ${port}`);
  console.log(`Vector store size: ${ragService.getVectorStoreSize()} chunks`);
});

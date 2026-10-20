/**
 * ragService.js
 *
 * RAG (Retrieval-Augmented Generation) pipeline for the Tomato customer
 * support chatbot. Responsibilities:
 *
 *  1. INDEXING  — Load PDF files from the knowledge/ directory, split them
 *                 into overlapping text chunks, embed each chunk with the
 *                 OpenAI embeddings API, and store the vectors in Pinecone.
 *
 *  2. RETRIEVAL — Given a user query, embed it, search Pinecone for the
 *                 top-K most relevant chunks, and return them as a
 *                 formatted context string.
 *
 *  3. GENERATION — Inject the retrieved context into the system prompt and
 *                  call the LLM (streaming or non-streaming) via the existing
 *                  summarizeService factory, so all existing endpoints keep
 *                  working unchanged.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import pdfParse from "pdf-parse";
import OpenAI from "openai";

import { createPineconeStore } from "./pineconeStore.js";
import { createSummarizeService, DEFAULT_SYSTEM_PROMPT } from "./summarizeService.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Folder containing the company policy PDF files. */
const KNOWLEDGE_DIR = path.join(__dirname, "..", "knowledge");

/** Embedding model — small, fast, cheap (1536 dimensions). */
const EMBEDDING_MODEL = "text-embedding-3-small";

/**
 * Target chunk size in characters.
 * ~300 chars ≈ 75 tokens, well inside the 8191-token embedding limit.
 */
const CHUNK_SIZE = 300;

/** Overlap between consecutive chunks to preserve context across boundaries. */
const CHUNK_OVERLAP = 50;

/** Number of retrieved chunks to inject as context. */
const TOP_K = 3;

// ---------------------------------------------------------------------------
// Text splitting helpers
// ---------------------------------------------------------------------------

/**
 * Split a long string into overlapping fixed-size chunks.
 *
 * @param {string} text
 * @param {number} chunkSize
 * @param {number} overlap
 * @returns {string[]}
 */
function splitIntoChunks(text, chunkSize = CHUNK_SIZE, overlap = CHUNK_OVERLAP) {
  const chunks = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    const chunk = text.slice(start, end).trim();
    if (chunk.length > 0) {
      chunks.push(chunk);
    }
    if (end === text.length) break;
    start += chunkSize - overlap;
  }
  return chunks;
}

// ---------------------------------------------------------------------------
// PDF loading
// ---------------------------------------------------------------------------

/**
 * Read and parse all PDF files found in the knowledge directory.
 *
 * @returns {Promise<Array<{filename: string, text: string}>>}
 */
async function loadPDFs() {
  if (!fs.existsSync(KNOWLEDGE_DIR)) {
    console.warn(
      `[RAG] knowledge/ directory not found at ${KNOWLEDGE_DIR}. ` +
      "Starting without any knowledge base."
    );
    return [];
  }

  const files = fs
    .readdirSync(KNOWLEDGE_DIR)
    .filter((f) => f.toLowerCase().endsWith(".pdf"));

  if (files.length === 0) {
    console.warn("[RAG] No PDF files found in knowledge/. Starting without knowledge base.");
    return [];
  }

  const results = [];
  for (const filename of files) {
    const filePath = path.join(KNOWLEDGE_DIR, filename);
    try {
      const buffer = fs.readFileSync(filePath);
      const { text } = await pdfParse(buffer);
      results.push({ filename, text: text.replace(/\s+/g, " ") });
      console.log(`[RAG] Loaded PDF: ${filename} (${text.length} chars)`);
    } catch (err) {
      console.error(`[RAG] Failed to parse ${filename}:`, err.message);
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
// Embedding helpers
// ---------------------------------------------------------------------------

/**
 * Batch-embed an array of strings using the OpenAI embeddings endpoint.
 * Returns one embedding vector per input string.
 *
 * @param {OpenAI} client
 * @param {string[]} texts
 * @returns {Promise<number[][]>}
 */
async function embedBatch(client, texts) {
  if (texts.length === 0) return [];
  const response = await client.embeddings.create({
    model: EMBEDDING_MODEL,
    input: texts,
  });
  // Sort by index to guarantee ordering (API guarantees it, but let's be safe)
  return response.data
    .sort((a, b) => a.index - b.index)
    .map((item) => item.embedding);
}

// ---------------------------------------------------------------------------
// Public factory
// ---------------------------------------------------------------------------

/**
 * Build and return the RAG-enhanced chat service.
 *
 * This factory:
 *  1. Initialises the vector store and the OpenAI client.
 *  2. Indexes all PDFs from the knowledge/ directory (async, awaited).
 *  3. Returns an object with the same interface as `createSummarizeService`
 *     so the rest of the app (app.js, server.js) needs no changes.
 *
 * @param {{
 *   client?: OpenAI,
 *   model?: string,
 *   topK?: number,
 * }} [options]
 *
 * @returns {Promise<ReturnType<typeof createSummarizeService>>}
 */
export async function createRagService({
  client = new OpenAI(),
  model = process.env.OPENAI_MODEL || "gpt-4o-mini",
  topK = TOP_K,
} = {}) {
  // Pinecone store is async — it connects and verifies the index on init.
  const vectorStore = await createPineconeStore();

  // -----------------------------------------------------------------------
  // STEP 1 — INDEXING: Load PDFs, chunk, embed, store
  // -----------------------------------------------------------------------
  console.log("[RAG] Starting knowledge base indexing…");

  const pdfs = await loadPDFs();

  for (const { filename, text } of pdfs) {
    const chunks = splitIntoChunks(text);
    console.log(`[RAG] ${filename}: ${chunks.length} chunks to embed`);

    // Embed in batches of 100 (well within the API limit of 2048 inputs)
    const BATCH = 100;
    for (let i = 0; i < chunks.length; i += BATCH) {
      const batch = chunks.slice(i, i + BATCH);
      const embeddings = await embedBatch(client, batch);
      // Pinecone upserts are async — await each add call.
      for (let j = 0; j < embeddings.length; j++) {
        await vectorStore.add(batch[j], embeddings[j], {
          source: filename,
          chunkIndex: i + j,
        });
      }
    }
    console.log(`[RAG] ${filename}: indexed ✓`);
  }

  console.log(
    `[RAG] Indexing complete. Vector store contains ${vectorStore.size()} chunks.`
  );

  // -----------------------------------------------------------------------
  // STEP 2 — RETRIEVAL helper
  // -----------------------------------------------------------------------

  /**
   * Embed a query string and retrieve the top-K most relevant chunks.
   *
   * @param {string} query
   * @returns {Promise<string>}   Formatted context block ready to inject
   */
  async function retrieveContext(query) {
    if (vectorStore.size() === 0) return "";

    const [queryEmbedding] = await embedBatch(client, [query]);
    const results = await vectorStore.search(queryEmbedding, topK);

    if (results.length === 0) return "";

    return results
      .map((r) => r.chunk)
      .join("\n\n");
  }

  // -----------------------------------------------------------------------
  // STEP 3 — GENERATION: Single service instance; system prompt is passed
  // directly as a template string with the RAG context injected each turn.
  // -----------------------------------------------------------------------

  /**
   * Build the augmented system prompt by injecting the retrieved company
   * knowledge directly into the prompt string — matching the pattern:
   *
   *   <base instructions>
   *
   *   COMPANY INFORMATION:
   *   <retrieved chunks>
   *
   *   Answer the customer using ONLY the above information.
   *   If the answer is not in the documents, say so politely.
   *
   * @param {string} context - Retrieved chunks joined as plain text
   * @returns {string}
   */
  function buildSystemPrompt(context) {
    if (!context) return DEFAULT_SYSTEM_PROMPT;

    return `${DEFAULT_SYSTEM_PROMPT}

COMPANY INFORMATION:
${context}

Answer the customer using ONLY the information provided above.
If the answer is not available in the company documents, politely say:
"I don't have that information in our company documents. Please contact support@tomato.com for further help."`;
  }

  /**
   * One service instance is created per conversation session.
   * We pass the augmented system prompt directly via the systemPrompt option;
   * createSummarizeService places it as history[0] with role "system".
   *
   * On each subsequent turn we swap out history[0] so the freshly retrieved
   * context always reflects the current query.
   */
  const service = createSummarizeService({
    client,
    model,
    systemPrompt: buildSystemPrompt(""),
  });

  /**
   * Core RAG-augmented streaming generator.
   *
   * @param {string} message - Raw user message
   * @yields {string} streaming delta chunks
   */
  async function* stream(message) {
    // 1. Retrieve relevant context for this specific query
    const context = await retrieveContext(message);

    // 2. Pass the augmented system prompt directly — update history[0] so the
    //    freshest context is always in the system role for this turn.
    service.getHistory()[0] = {
      role: "system",
      content: buildSystemPrompt(context),
    };

    // 3. Stream the response through the single service instance
    yield* service.stream(message);
  }

  /**
   * Non-streaming convenience wrapper.
   *
   * @param {string} message
   * @returns {Promise<string>}
   */
  async function chat(message) {
    let result = "";
    for await (const chunk of stream(message)) {
      result += chunk;
    }
    return result;
  }

  return {
    stream,
    chat,
    chatStream: stream,
    summarize: chat,
    summarizeStream: stream,
    getHistory: () => service.getHistory(),
    getVectorStoreSize: () => vectorStore.size(),
  };
}

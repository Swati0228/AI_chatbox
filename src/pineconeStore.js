/**
 * pineconeStore.js
 *
 * Pinecone vector store adapter that exposes the same
 * { add, search, size } interface as the in-memory vectorStore.js,
 * so ragService.js can swap backends with a single import change.
 *
 * Prerequisites
 * -------------
 * 1. A Pinecone account → https://app.pinecone.io
 * 2. An index created with:
 *      - Dimensions : 1536  (matches text-embedding-3-small)
 *      - Metric     : cosine
 * 3. Environment variables set in .env:
 *      PINECONE_API_KEY=<your-api-key>
 *      PINECONE_INDEX=<your-index-name>
 *
 * Usage
 * -----
 *   import { createPineconeStore } from "./pineconeStore.js";
 *   const store = await createPineconeStore();   // ← async init
 */

import { Pinecone } from "@pinecone-database/pinecone";
import crypto from "node:crypto";

/** Embedding dimensions produced by text-embedding-3-small. */
const EMBEDDING_DIMENSIONS = 1536;

/**
 * Generates a stable, deterministic ID for a chunk so that re-indexing
 * the same document does not create duplicate vectors.
 *
 * @param {string} chunk
 * @param {object} metadata
 * @returns {string}
 */
function chunkId(chunk, metadata) {
  const raw = `${metadata.source ?? ""}::${metadata.chunkIndex ?? 0}::${chunk.slice(0, 64)}`;
  return crypto.createHash("sha1").update(raw).digest("hex");
}

/**
 * Initialise and return a Pinecone-backed vector store.
 *
 * @param {{
 *   apiKey?: string,
 *   indexName?: string,
 *   namespace?: string,
 * }} [options]
 *
 * @returns {Promise<{
 *   add    : (chunk: string, embedding: number[], metadata?: object) => Promise<void>,
 *   search : (queryEmbedding: number[], topK?: number) => Promise<Array<{chunk: string, score: number, metadata: object}>>,
 *   size   : () => number,
 * }>}
 */
export async function createPineconeStore({
  apiKey    = process.env.PINECONE_API_KEY,
  indexName = process.env.PINECONE_INDEX,
  namespace = process.env.PINECONE_NAMESPACE || "tomato-knowledge",
} = {}) {
  if (!apiKey)    throw new Error("PINECONE_API_KEY is not set.");
  if (!indexName) throw new Error("PINECONE_INDEX is not set.");

  const pinecone = new Pinecone({ apiKey });

  // Verify the index exists; fail fast with a clear message if not.
  const existingIndexes = await pinecone.listIndexes();
  const names = (existingIndexes.indexes ?? []).map((i) => i.name);
  if (!names.includes(indexName)) {
    throw new Error(
      `Pinecone index "${indexName}" not found. ` +
      `Available indexes: ${names.join(", ") || "(none)"}. ` +
      "Create it at https://app.pinecone.io with dimension=1536 and metric=cosine."
    );
  }

  const index = pinecone.index(indexName).namespace(namespace);

  /** Local count — Pinecone's describeIndexStats() is eventually consistent. */
  let _size = 0;

  // Fetch the current count from Pinecone so restarts don't reset to 0.
  try {
    const stats = await pinecone.index(indexName).describeIndexStats();
    const nsStats = stats.namespaces?.[namespace];
    _size = nsStats?.recordCount ?? 0;
    console.log(`[Pinecone] Connected to index "${indexName}" (namespace: "${namespace}"), ${_size} existing vectors.`);
  } catch {
    console.warn("[Pinecone] Could not fetch index stats; size counter starts at 0.");
  }

  // -------------------------------------------------------------------------
  // add — upsert one chunk + embedding into Pinecone
  // -------------------------------------------------------------------------

  /**
   * @param {string}   chunk
   * @param {number[]} embedding
   * @param {object}   [metadata]
   */
  async function add(chunk, embedding, metadata = {}) {
    const id = chunkId(chunk, metadata);

    await index.upsert([
      {
        id,
        values: embedding,
        metadata: {
          ...metadata,
          // Store the raw text in the metadata so we can return it on query
          chunk,
        },
      },
    ]);

    _size += 1;
  }

  // -------------------------------------------------------------------------
  // search — query Pinecone and return top-K results
  // -------------------------------------------------------------------------

  /**
   * @param {number[]} queryEmbedding
   * @param {number}   [topK=3]
   * @returns {Promise<Array<{chunk: string, score: number, metadata: object}>>}
   */
  async function search(queryEmbedding, topK = 3) {
    const response = await index.query({
      vector: queryEmbedding,
      topK,
      includeMetadata: true,
    });

    return (response.matches ?? []).map((match) => {
      const { chunk, ...rest } = match.metadata ?? {};
      return {
        chunk : chunk ?? "",
        score : match.score ?? 0,
        metadata: rest,
      };
    });
  }

  // -------------------------------------------------------------------------
  // size — returns the locally-tracked count
  // -------------------------------------------------------------------------
  function size() {
    return _size;
  }

  return { add, search, size };
}

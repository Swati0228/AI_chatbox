/**
 * pineconeStore.js
 *
 * Pinecone vector store adapter using Pinecone's **integrated inference**
 * (e.g. llama-text-embed-v2). Pinecone embeds the text automatically —
 * no external embedding API call is needed.
 *
 * Interface exposed (text-based, not vector-based):
 *   add(chunk, metadata?)  → Promise<void>
 *   search(query, topK?)   → Promise<Array<{chunk, score, metadata}>>
 *   size()                 → number
 *
 * Prerequisites
 * -------------
 * 1. A Pinecone account → https://app.pinecone.io
 * 2. An index created with an integrated embedding model
 *    (e.g. llama-text-embed-v2) — exactly what you have!
 * 3. Environment variables in .env:
 *      PINECONE_API_KEY=<your-api-key>
 *      PINECONE_INDEX=tomato-support
 *      PINECONE_NAMESPACE=tomato-knowledge  (optional)
 */

import { Pinecone } from "@pinecone-database/pinecone";
import crypto from "node:crypto";

/**
 * Generate a stable, deterministic record ID so re-indexing the same
 * document never creates duplicate vectors — Pinecone upserts over same IDs.
 *
 * @param {string} chunk
 * @param {object} metadata
 * @returns {string}
 */
function recordId(chunk, metadata = {}) {
  const raw = `${metadata.source ?? ""}::${metadata.chunkIndex ?? 0}::${chunk.slice(0, 64)}`;
  return crypto.createHash("sha1").update(raw).digest("hex");
}

/**
 * Initialise and return a Pinecone-backed vector store (integrated inference).
 *
 * @param {{
 *   apiKey?    : string,
 *   indexName? : string,
 *   namespace? : string,
 * }} [options]
 *
 * @returns {Promise<{
 *   add    : (chunk: string, metadata?: object) => Promise<void>,
 *   search : (query: string, topK?: number) => Promise<Array<{chunk: string, score: number, metadata: object}>>,
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

  // Verify the index exists before we proceed.
  const { indexes = [] } = await pinecone.listIndexes();
  const names = indexes.map((i) => i.name);
  if (!names.includes(indexName)) {
    throw new Error(
      `Pinecone index "${indexName}" not found. ` +
      `Available: ${names.join(", ") || "(none)"}. ` +
      "Create it at https://app.pinecone.io with an integrated embedding model."
    );
  }

  // Use the namespace-scoped index reference for all record operations.
  const index = pinecone.index(indexName).namespace(namespace);

  /** Locally-tracked count (Pinecone stats are eventually consistent). */
  let _size = 0;

  // Fetch current record count so restarts don't reset the counter to 0.
  try {
    const stats = await pinecone.index(indexName).describeIndexStats();
    _size = stats.namespaces?.[namespace]?.recordCount ?? 0;
    console.log(
      `[Pinecone] Connected → index: "${indexName}", namespace: "${namespace}", ` +
      `existing records: ${_size}`
    );
  } catch {
    console.warn("[Pinecone] Could not fetch index stats; counter starts at 0.");
  }

  // -------------------------------------------------------------------------
  // add — upsert one chunk into Pinecone (integrated inference embeds it)
  // -------------------------------------------------------------------------

  /**
   * Upsert a text chunk. Pinecone uses its integrated model (llama-text-embed-v2)
   * to generate the vector — no external embedding call needed.
   *
   * @param {string} chunk     - Raw text to store
   * @param {object} [metadata]
   */
  async function add(chunk, metadata = {}) {
    const id = recordId(chunk, metadata);

    // upsertRecords is the integrated-inference API — pass text, not vectors.
    await index.upsertRecords([
      {
        id,
        chunk,          // stored in metadata; returned on search
        ...metadata,    // source, chunkIndex, etc.
      },
    ]);

    _size += 1;
  }

  // -------------------------------------------------------------------------
  // search — query Pinecone with raw text (integrated inference embeds it)
  // -------------------------------------------------------------------------

  /**
   * Search using a plain text query. Pinecone embeds the query internally
   * with llama-text-embed-v2 and returns the nearest neighbours.
   *
   * @param {string} query
   * @param {number} [topK=3]
   * @returns {Promise<Array<{chunk: string, score: number, metadata: object}>>}
   */
  async function search(query, topK = 3) {
    // searchRecords is the integrated-inference query API.
    const response = await index.searchRecords({
      query: {
        inputs: { text: query },
        topK,
      },
      fields: ["chunk", "source", "chunkIndex"],
    });

    return (response.result?.hits ?? []).map((hit) => {
      const { chunk = "", ...rest } = hit.fields ?? {};
      return {
        chunk,
        score   : hit._score ?? 0,
        metadata: rest,
      };
    });
  }

  // -------------------------------------------------------------------------
  // size — returns the locally-tracked record count
  // -------------------------------------------------------------------------
  function size() {
    return _size;
  }

  return { add, search, size };
}

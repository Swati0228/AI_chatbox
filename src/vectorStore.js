/**
 * vectorStore.js
 *
 * In-memory vector store that supports:
 *  - Adding document chunks with pre-computed embeddings
 *  - Cosine-similarity search to retrieve the top-K most relevant chunks
 *
 * No external database required. All data lives in RAM for the lifetime
 * of the server process.
 */

/**
 * Computes the cosine similarity between two equal-length numeric arrays.
 * Returns a value in [-1, 1]; higher means more similar.
 *
 * @param {number[]} a
 * @param {number[]} b
 * @returns {number}
 */
function cosineSimilarity(a, b) {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

/**
 * Creates and returns a new in-memory vector store instance.
 *
 * @returns {{
 *   add: (chunk: string, embedding: number[], metadata?: object) => void,
 *   search: (queryEmbedding: number[], topK?: number) => Array<{chunk: string, score: number, metadata: object}>,
 *   size: () => number,
 * }}
 */
export function createVectorStore() {
  /** @type {Array<{chunk: string, embedding: number[], metadata: object}>} */
  const documents = [];

  /**
   * Add a chunk and its embedding to the store.
   *
   * @param {string} chunk        - The raw text snippet
   * @param {number[]} embedding  - Dense vector from an embedding model
   * @param {object} [metadata]   - Optional metadata (e.g. source filename, page)
   */
  function add(chunk, embedding, metadata = {}) {
    documents.push({ chunk, embedding, metadata });
  }

  /**
   * Find the top-K most similar chunks to a query embedding.
   *
   * @param {number[]} queryEmbedding
   * @param {number} [topK=3]
   * @returns {Array<{chunk: string, score: number, metadata: object}>}
   */
  function search(queryEmbedding, topK = 3) {
    return documents
      .map((doc) => ({
        chunk: doc.chunk,
        score: cosineSimilarity(queryEmbedding, doc.embedding),
        metadata: doc.metadata,
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }

  /** Total number of stored chunks. */
  function size() {
    return documents.length;
  }

  return { add, search, size };
}

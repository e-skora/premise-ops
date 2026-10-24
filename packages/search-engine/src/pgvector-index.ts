// @premise title: ADR-027: In-Database pgvector HNSW Index (Skip Dedicated Pinecone Cluster)
// @premise type: ADR
// @premise claim: Total embedded document vectors remain below 1,500,000 rows so HNSW index fits in 16GB shared_buffers
// @premise metric: pgvector_total_rows < 1500000 rows (current: 1380000, margin: 0.12)
// @premise probe: SQL_METRIC | SELECT CAST(value AS REAL) AS value FROM TelemetryMetric WHERE variableName = 'pgvector_total_rows'
// @premise blastRadius: Migrate vector workload out of RDS Postgres into dedicated Pinecone/Qdrant cluster and remove HNSW maintenance cron

export interface VectorSearchQuery {
  embedding: number[];
  workspaceId: string;
  topK: number;
}

export async function queryInDatabasePgVectorIndex(query: VectorSearchQuery) {
  // Co-located pgvector HNSW index lookup inside primary transactional Postgres instance
  const efSearch = 64;
  return executePostgresHnswScan(query.workspaceId, query.embedding, {
    efSearch,
    topK: query.topK,
    indexName: "idx_documents_embedding_hnsw_cosine",
  });
}

async function executePostgresHnswScan(
  workspaceId: string,
  _embedding: number[],
  opts: { efSearch: number; topK: number; indexName: string }
) {
  return {
    engine: "rds-postgres-pgvector-hnsw",
    workspaceId,
    indexName: opts.indexName,
    matches: [],
    scanLatencyMs: 19,
  };
}

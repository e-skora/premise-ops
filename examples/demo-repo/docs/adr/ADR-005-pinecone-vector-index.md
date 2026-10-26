# ADR-005: Managed Pinecone Vector Index for Customer Embeddings
**Status:** Accepted | **Owner:** Core Search Team | **Locus:** `examples/demo-repo/packages/search-engine/src/pgvector-index.ts:L1-L30`

## Context & Problem Statement
Our document ingestion engine processes 120k customer PDF pages per day. We need low-latency vector similarity search for hybrid retrieval. We evaluate managed Pinecone versus hosting local pgvector inside RDS.

## Load-Bearing Premises
We justify maintaining a dedicated paid Pinecone index reservation only while the following quantitative constraints hold:
1. **Vector DB Cost Ceiling:** vector_embedding_cost_monthly_usd < 450.00 USD / mo across all index pods.
2. **Index Query P95 Latency:** vector_query_p95_ms < 120 ms under 90th-percentile query load.

## Decision
We provision a 2-pod Pinecone index in `examples/demo-repo/packages/search-engine/src/pgvector-index.ts:L1-L30` with dotproduct metric.

## Blast Radius & Sunset Criteria
Decommission $450/mo Pinecone pod reservation and revert to local Postgres pgvector if monthly cost breaches $450/mo or latency exceeds 120ms.

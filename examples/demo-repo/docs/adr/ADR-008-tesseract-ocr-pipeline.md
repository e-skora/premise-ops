# ADR-008: Local Tesseract OCR Extraction Worker
**Status:** Accepted | **Owner:** Ingest Infrastructure | **Locus:** `examples/demo-repo/services/ingest-worker/queue.ts:L1-L25`

## Context & Problem Statement
Scanned receipt images must be converted to text before categorization. Direct multimodal vision LLM extraction costs $0.035 per image.

## Load-Bearing Premises
We justify maintaining 850 LOC custom C++ Tesseract OCR bindings and local worker pools only while:
1. **Multimodal Model Pricing Bound:** multimodal_vision_token_cost_usd > 0.015 USD / image across frontier vision models.

## Decision
Run headless Tesseract OCR worker in `examples/demo-repo/services/ingest-worker/queue.ts:L1-L25` with fallback to cloud vision.

## Blast Radius & Sunset Criteria
Decommission 850 LOC local C++ tesseract binding worker and route receipt images directly to multimodal vision models once multimodal token cost drops <= $0.015 / image.

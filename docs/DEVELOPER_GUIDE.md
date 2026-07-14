# Codebase Developer Guide

This document describes modular structures and extension interfaces.

## Codebase Map

- `/backend/app/intelligence`: Abstract classes for extractor modules. Heuristic parsers analyze transcription lines on room end.
- `/backend/app/search`: Substring search engine queries over MongoDB, matching transcripts or summaries.
- `/backend/app/integrations`: HMAC secure webhooks dispatcher.
- `/backend/app/exporter`: Document exporters generating JSON, HTML, Markdown, and PDF.

## Swap-in Local LLM Support
Future LLM extractors can swap in by extending `MeetingIntelligenceModule`:

```python
from app.intelligence.service import MeetingIntelligenceModule

class LocalLlamaSummaryGenerator(MeetingIntelligenceModule):
    async def process(self, transcripts: list[dict]) -> str:
        # Load local llama.cpp or transformers instance
        # Return generated text
        pass
```

## Swap-in Vector Indices Support
SWAP-in Milvus or Qdrant search engines by extending `SearchEngine` in `/backend/app/search/service.py`:

```python
from app.search.service import SearchEngine

class VectorSearchEngine(SearchEngine):
    async def keyword_search(self, query: str, limit: int = 50) -> list[dict]:
        # Generate query embedding locally using SentenceTransformers
        # Query vector store index
        pass
```

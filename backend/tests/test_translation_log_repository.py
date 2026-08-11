import unittest

from app.repositories.translation_log_repository import TranslationLogRepository


class FakeCollection:
    def __init__(self) -> None:
        self.inserted: dict | None = None

    async def insert_one(self, document: dict) -> None:
        self.inserted = document


class FakeDb(dict):
    def __getitem__(self, key):
        return self.setdefault(key, FakeCollection())


class TranslationLogRepositoryTest(unittest.IsolatedAsyncioTestCase):
    async def test_log_persists_per_stage_latency_breakdown(self) -> None:
        db = FakeDb()
        repo = TranslationLogRepository(db)
        await repo.log(
            room_id="room-1",
            speaker="Alice",
            source_language="en",
            target_language="hi",
            transcript="hello",
            translated_text="namaste",
            latency_ms=900,
            cache_hit=False,
            voice_model="hi-neutral",
            translation_success=True,
            stt_latency_ms=250,
            translation_latency_ms=400,
            tts_latency_ms=250,
        )
        doc = db["translation_logs"].inserted
        self.assertEqual(doc["latency_ms"], 900)
        self.assertEqual(doc["stt_latency_ms"], 250)
        self.assertEqual(doc["translation_latency_ms"], 400)
        self.assertEqual(doc["tts_latency_ms"], 250)

    async def test_stage_latencies_default_to_none_when_not_supplied(self) -> None:
        db = FakeDb()
        repo = TranslationLogRepository(db)
        await repo.log(
            room_id="room-1",
            speaker="Alice",
            source_language="en",
            target_language="hi",
            transcript="hi",
            translated_text="namaste",
            latency_ms=0,
            cache_hit=True,
            voice_model=None,
            translation_success=True,
        )
        doc = db["translation_logs"].inserted
        self.assertIsNone(doc["stt_latency_ms"])
        self.assertIsNone(doc["translation_latency_ms"])
        self.assertIsNone(doc["tts_latency_ms"])


if __name__ == "__main__":
    unittest.main()

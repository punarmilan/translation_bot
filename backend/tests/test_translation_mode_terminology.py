"""Regression tests for Phase 8: completing the translation-mode flow so an
admin-configured mode's preferred_terminology (see admin-backend's
/admin/translation-modes) actually reaches the translated output, instead of
translation_mode being stored on the room and echoed back but otherwise
ignored by the translation pipeline (see TranslationService.translate_text
and _load_mode_terminology in app/translation/service.py).
"""

import unittest
from unittest.mock import AsyncMock, MagicMock, patch

from app.translation.service import TranslationContext, TranslationService


class FakeProvider:
    name = "fake"

    def __init__(self, response_text: str) -> None:
        self.response_text = response_text
        self.calls: list[tuple[str, str, str]] = []

    async def translate(self, text: str, source_lang: str, target_lang: str) -> str:
        self.calls.append((text, source_lang, target_lang))
        return self.response_text


def _fake_db(mode_doc=None, glossary_entries=None):
    db = MagicMock()

    modes_collection = AsyncMock()
    modes_collection.find_one = AsyncMock(return_value=mode_doc)

    glossaries_collection = AsyncMock()
    glossaries_collection.find = MagicMock(return_value=_FakeCursor(glossary_entries or []))

    def getitem(name):
        if name == "translation_modes":
            return modes_collection
        if name == "glossaries":
            return glossaries_collection
        return AsyncMock()

    db.__getitem__.side_effect = getitem
    return db, modes_collection


class _FakeCursor:
    def __init__(self, rows):
        self._rows = rows

    async def to_list(self, length=None):
        return list(self._rows)


class TranslationModeTerminologyTest(unittest.IsolatedAsyncioTestCase):
    async def test_mode_preferred_terminology_is_applied_to_translated_output(self) -> None:
        provider = FakeProvider("We will discuss the sprint plan")
        service = TranslationService(provider=provider)
        db, modes_collection = _fake_db(
            mode_doc={
                "name": "Business",
                "enabled": True,
                "preferred_terminology": {"sprint": "quarterly review"},
            }
        )

        with patch("app.database.get_db", return_value=db):
            result = await service.translate_text(
                "Discutiremos el plan del sprint",
                target_lang="en",
                source_lang="es",
                context=TranslationContext(
                    speaker_language="es",
                    target_language="en",
                    translation_mode="Business",
                ),
            )

        self.assertEqual(result.translated, "We will discuss the quarterly review plan")
        modes_collection.find_one.assert_awaited_once()

    async def test_general_mode_does_not_look_up_translation_modes_collection(self) -> None:
        provider = FakeProvider("Hello there")
        service = TranslationService(provider=provider)
        db, modes_collection = _fake_db(mode_doc=None)

        with patch("app.database.get_db", return_value=db):
            result = await service.translate_text(
                "Hola",
                target_lang="en",
                source_lang="es",
                context=TranslationContext(
                    speaker_language="es",
                    target_language="en",
                    translation_mode="General",
                ),
            )

        self.assertEqual(result.translated, "Hello there")
        modes_collection.find_one.assert_not_awaited()

    async def test_disabled_mode_terminology_is_not_applied(self) -> None:
        provider = FakeProvider("We will discuss the sprint plan")
        service = TranslationService(provider=provider)
        db, _ = _fake_db(
            mode_doc=None,  # find_one filters on enabled != False; simulate no active match
        )

        with patch("app.database.get_db", return_value=db):
            result = await service.translate_text(
                "Discutiremos el plan del sprint",
                target_lang="en",
                source_lang="es",
                context=TranslationContext(
                    speaker_language="es",
                    target_language="en",
                    translation_mode="Business",
                ),
            )

        self.assertEqual(result.translated, "We will discuss the sprint plan")


if __name__ == "__main__":
    unittest.main()

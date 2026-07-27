import asyncio
import unittest

from app.tts.service import PersistentPiperProcess, TTSUnavailableError


class PiperFailureReportingTest(unittest.IsolatedAsyncioTestCase):
    async def test_missing_model_path_raises_instead_of_faking_success(self) -> None:
        proc = PersistentPiperProcess(model_path="", config_path=None)
        with self.assertRaises(TTSUnavailableError):
            await proc.synthesize("hello world", "1.0", "0.25", "", "")

    async def test_nonexistent_model_path_raises_instead_of_faking_success(self) -> None:
        proc = PersistentPiperProcess(model_path="/nonexistent/model.onnx", config_path=None)
        with self.assertRaises(TTSUnavailableError):
            await proc.synthesize("hello world", "1.0", "0.25", "", "")

    async def test_read_timeout_raises_ttsunavailableerror(self) -> None:
        import time as time_module

        proc = PersistentPiperProcess(model_path="/nonexistent/model.onnx", config_path=None)

        class FakeProcess:
            def poll(self):
                return None

        proc.process = FakeProcess()
        proc._write_stdin = lambda _data: None  # type: ignore[method-assign]
        proc._read_stdout = lambda: time_module.sleep(1) or "ok"  # genuinely blocks the worker thread

        # Patch the timeout to something tiny so the test doesn't actually wait 30s.
        import app.tts.service as tts_module
        original_timeout = tts_module.PIPER_TIMEOUT_SECONDS
        tts_module.PIPER_TIMEOUT_SECONDS = 0.05
        try:
            with self.assertRaises(TTSUnavailableError) as ctx:
                await proc.synthesize("hello world", "1.0", "0.25", "", "")
            self.assertIn("timed out", str(ctx.exception))
        finally:
            tts_module.PIPER_TIMEOUT_SECONDS = original_timeout


if __name__ == "__main__":
    unittest.main()

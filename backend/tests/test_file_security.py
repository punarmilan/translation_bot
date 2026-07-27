import os
import unittest

from fastapi import HTTPException

from app.routes import _resolve_upload_path


class ResolveUploadPathTest(unittest.TestCase):
    def test_normal_filename_stays_inside_uploads_dir(self) -> None:
        path = _resolve_upload_path("room123", "file-id", "report.pdf")
        base_dir = os.path.abspath("uploads")
        self.assertTrue(path.startswith(base_dir + os.sep))
        self.assertTrue(path.endswith("file-id_report.pdf"))

    def test_path_traversal_in_filename_is_stripped(self) -> None:
        path = _resolve_upload_path("room123", "file-id", "../../../../etc/passwd")
        base_dir = os.path.abspath("uploads")
        self.assertTrue(path.startswith(base_dir + os.sep))
        # os.path.basename strips all directory components, leaving only "passwd".
        self.assertTrue(path.endswith("file-id_passwd"))

    def test_path_traversal_in_room_id_is_stripped(self) -> None:
        path = _resolve_upload_path("../../evil", "file-id", "report.pdf")
        base_dir = os.path.abspath("uploads")
        self.assertTrue(path.startswith(base_dir + os.sep))

    def test_windows_style_traversal_is_stripped(self) -> None:
        path = _resolve_upload_path("room123", "file-id", "..\\..\\evil.exe")
        base_dir = os.path.abspath("uploads")
        self.assertTrue(path.startswith(base_dir + os.sep))


if __name__ == "__main__":
    unittest.main()

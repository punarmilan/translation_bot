from __future__ import annotations

import argparse
import shutil
import sys
from pathlib import Path

from huggingface_hub import hf_hub_download

sys.path.append(str(Path(__file__).resolve().parents[1]))

from app.tts.voices import (  # noqa: E402
    DEFAULT_PIPER_MODEL_DIR,
    PIPER_LANGUAGE_NAMES,
    PIPER_REPO_ID,
    PIPER_VOICE_VARIANTS,
    PIPER_VOICE_FILES,
)


def download_voice(language: str, output_dir: Path) -> None:
    model_files = {PIPER_VOICE_FILES[language]}
    model_files.update(PIPER_VOICE_VARIANTS.get(language, {}).values())

    output_dir.mkdir(parents=True, exist_ok=True)
    for model_file in sorted(model_files):
        for repo_file in (model_file, f"{model_file}.json"):
            downloaded = hf_hub_download(repo_id=PIPER_REPO_ID, filename=repo_file)
            destination = output_dir / Path(repo_file).name
            if destination.exists():
                print(f"{language}: already exists {destination}")
                continue
            shutil.copy2(downloaded, destination)
            print(f"{language}: {destination}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Download Piper TTS voice models.")
    parser.add_argument(
        "languages",
        nargs="*",
        help="Language codes to download. Defaults to all configured voices.",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=DEFAULT_PIPER_MODEL_DIR,
        help="Directory where voice files will be copied.",
    )
    args = parser.parse_args()

    languages = args.languages or list(PIPER_VOICE_FILES)
    invalid = [language for language in languages if language not in PIPER_VOICE_FILES]
    if invalid:
        supported = ", ".join(
            f"{code}={name}" for code, name in PIPER_LANGUAGE_NAMES.items()
        )
        raise SystemExit(f"Unsupported language(s): {', '.join(invalid)}. Supported: {supported}")

    for language in languages:
        print(f"Downloading {language} ({PIPER_LANGUAGE_NAMES[language]})...")
        download_voice(language, args.output_dir)

    print(f"Done. Voice files are in: {args.output_dir}")


if __name__ == "__main__":
    main()

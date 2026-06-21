#!/usr/bin/env python3
"""Generate all 36 Dart locale files for ProPDFs.

Reads translations from `locale_data.py` (one dict per language code) and
emits one .dart file per language into frontend/lib/core/localization/locales/.

Run from the repo root:
    python3 scripts/generate_locales.py
"""
import sys
from pathlib import Path

# Make _locale_writer importable when invoked from repo root
sys.path.insert(0, str(Path(__file__).parent))
from _locale_writer import write_all  # noqa: E402

from locale_data import LOCALES  # noqa: E402


def main() -> None:
    written = write_all(LOCALES)
    print(f"Wrote {len(written)} locale files:")
    for p in sorted(written):
        print(f"  {p}")


if __name__ == "__main__":
    main()

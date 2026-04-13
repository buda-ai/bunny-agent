#!/usr/bin/env python3
"""
Download GAIA benchmark (validation split, all 3 levels) from HuggingFace.

Usage:
    python scripts/download-gaia.py [--out data/gaia.json]

Requires:
    pip install datasets huggingface_hub

The GAIA dataset may require HuggingFace login for access:
    huggingface-cli login
"""

import argparse
import json
import sys
from pathlib import Path


def download_gaia(out_path: Path) -> None:
    try:
        from datasets import load_dataset
    except ImportError:
        print("ERROR: 'datasets' package not found. Run: pip install datasets", file=sys.stderr)
        sys.exit(1)

    rows = []
    levels = ["2023_level1", "2023_level2", "2023_level3"]

    for level in levels:
        print(f"Downloading {level}...", flush=True)
        try:
            ds = load_dataset("gaia-benchmark/GAIA", level, split="validation")
        except Exception as e:
            print(f"  ERROR loading {level}: {e}", file=sys.stderr)
            print("  Tip: run `huggingface-cli login` if the dataset is gated.", file=sys.stderr)
            sys.exit(1)

        level_num = int(level[-1])
        for row in ds:
            # Skip tasks with file attachments — they require downloading extra files
            # and cannot be run locally without additional setup.
            rows.append({
                "task_id": row["task_id"],
                "question": row["Question"],
                "answer": row["Final answer"],
                "level": level_num,
                "has_file": bool(row.get("file_name")),
                "file_name": row.get("file_name") or "",
                "steps": row.get("Annotator Metadata", {}).get("Number of steps", ""),
                "tools": row.get("Annotator Metadata", {}).get("Tools", ""),
            })

        total = len(ds)
        no_file = sum(1 for r in ds if not r.get("file_name"))
        print(f"  {total} tasks ({no_file} without file attachment)")

    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(rows, indent=2, ensure_ascii=False))

    total_all = len(rows)
    no_file_all = sum(1 for r in rows if not r["has_file"])
    print(f"\nSaved {total_all} tasks ({no_file_all} without file) → {out_path}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Download GAIA benchmark from HuggingFace")
    parser.add_argument("--out", default="data/gaia.json", help="Output JSON path")
    args = parser.parse_args()

    out = Path(args.out)
    download_gaia(out)


if __name__ == "__main__":
    main()

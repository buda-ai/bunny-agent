#!/usr/bin/env python3
"""
Download all benchmark datasets used by bunny-bench.

Usage:
    python scripts/download-datasets.py [--datasets gaia,tblite]

Datasets:
    gaia    — GAIA benchmark (165 tasks, validation split)
              Source: gaia-benchmark/GAIA on HuggingFace
              Output: data/gaia.json
              May require HF login: huggingface-cli login

    tblite  — OpenThoughts-TBLite (100 terminal tasks, Docker-based)
              Source: NousResearch/openthoughts-tblite on HuggingFace
              Output: data/tblite.json
              Requires Docker to run: each task has a pre-built Docker image.

Requires:
    pip install datasets
"""

import argparse
import json
import os
import sys
from pathlib import Path

DATA_DIR = Path(__file__).parent.parent / "data"


def download_gaia() -> None:
    from datasets import load_dataset

    print("Downloading GAIA benchmark...")
    rows = []
    levels = ["2023_level1", "2023_level2", "2023_level3"]

    for level in levels:
        print(f"  {level}...", flush=True)
        try:
            ds = load_dataset("gaia-benchmark/GAIA", level, split="validation")
        except Exception as e:
            print(f"  ERROR: {e}", file=sys.stderr)
            print("  Tip: run `huggingface-cli login` if the dataset is gated.", file=sys.stderr)
            raise

        level_num = int(level[-1])
        for row in ds:
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
        no_file = sum(1 for r in rows if r["level"] == level_num and not r["has_file"])
        print(f"    {len(ds)} tasks ({no_file} without file)")

    out = DATA_DIR / "gaia.json"
    out.write_text(json.dumps(rows, indent=2, ensure_ascii=False))
    no_file_total = sum(1 for r in rows if not r["has_file"])
    print(f"  Saved {len(rows)} tasks ({no_file_total} without file) → {out}\n")


def download_tblite() -> None:
    from datasets import load_dataset

    print("Downloading OpenThoughts-TBLite dataset...")
    ds = load_dataset("NousResearch/openthoughts-tblite", split="train")

    rows = []
    for r in ds:
        rows.append({
            "task_name": r["task_name"],
            "instruction": r["instruction"],
            "docker_image": r["docker_image"],
            "category": r["category"],
            "difficulty": r["difficulty"],
            "tags": r["tags"],
            "agent_timeout_sec": r["agent_timeout_sec"],
            "test_sh": r["test_sh"],
            "environment_tar": r.get("environment_tar", ""),
            "tests_tar": r.get("tests_tar", ""),
        })

    out = DATA_DIR / "tblite.json"
    out.write_text(json.dumps(rows, indent=2, ensure_ascii=False))
    sz_kb = out.stat().st_size // 1024
    by_diff = {}
    for r in rows:
        by_diff[r["difficulty"]] = by_diff.get(r["difficulty"], 0) + 1
    print(f"  {len(rows)} tasks ({sz_kb} KB) → {out}")
    for diff, count in sorted(by_diff.items()):
        print(f"    {diff}: {count}")
    print()


ALL_DATASETS = {"gaia": download_gaia, "tblite": download_tblite}


def main() -> None:
    parser = argparse.ArgumentParser(description="Download bunny-bench datasets from HuggingFace")
    parser.add_argument(
        "--datasets",
        default=",".join(ALL_DATASETS.keys()),
        help=f"Comma-separated list of datasets to download. Options: {', '.join(ALL_DATASETS.keys())}",
    )
    args = parser.parse_args()

    try:
        from datasets import load_dataset  # noqa: F401
    except ImportError:
        print("ERROR: 'datasets' package not found. Run: pip install datasets", file=sys.stderr)
        sys.exit(1)

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    requested = [d.strip() for d in args.datasets.split(",")]

    for name in requested:
        if name not in ALL_DATASETS:
            print(f"ERROR: Unknown dataset '{name}'. Options: {', '.join(ALL_DATASETS.keys())}", file=sys.stderr)
            sys.exit(1)
        ALL_DATASETS[name]()

    print("Done.")


if __name__ == "__main__":
    main()

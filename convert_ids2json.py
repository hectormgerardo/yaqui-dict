#!/usr/bin/env python3
import argparse
import json
import re
from pathlib import Path

FIELDS = ("en", "fr", "es", "yaq")


def parse_line(line, line_number):
    line = line.rstrip("\r\n")
    if not line.strip():
        return None

    match = re.match(r"^\s*(\S+?)(?:\t+|\s+)(.*)$", line)
    if not match:
        raise ValueError(f"Line {line_number}: couldn't find an ID and text")

    item_id, rest = match.groups()

    id_match = re.fullmatch(r"(\d+)\.(\d+)", item_id)
    if not id_match:
        raise ValueError(
            f"Line {line_number}: ID {item_id!r} must look like '08.660'"
        )
    group_id, element_id = id_match.groups()

    parts = rest.split(";", 2)
    if len(parts) != 3:
        raise ValueError(
            f"Line {line_number}: expected English; French; Spanish"
        )

    en, fr, spanish_and_yaq = (part.strip() for part in parts)

    spanish_parts = re.split(r"\t+", spanish_and_yaq.strip(), maxsplit=1)
    es = spanish_parts[0].strip()
    yaq = spanish_parts[1].strip() if len(spanish_parts) > 1 else "X"

    return group_id, element_id, {
        "en": en,
        "fr": fr,
        "es": es,
        "yaq": yaq or "X",
    }


def join_values(new_value, old_value):
    """Join comma-separated values, placing new values first and removing duplicates."""
    values = []
    seen = set()

    for value in (new_value, old_value):
        for item in value.split(","):
            item = item.strip()
            if item and item != "X" and item not in seen:
                values.append(item)
                seen.add(item)

    return ", ".join(values) if values else "X"


def main():
    parser = argparse.ArgumentParser(
        description="Convert vocabulary lines to grouped JSON."
    )
    parser.add_argument("input", help="Input .txt file")
    parser.add_argument(
        "-o", "--output", default="output.json", help="Output JSON file"
    )
    parser.add_argument(
        "--join-duplicates",
        action="store_true",
        help="Merge fields when an ID appears more than once",
    )
    args = parser.parse_args()

    words_collection = {}

    with Path(args.input).open(encoding="utf-8") as file:
        for line_number, line in enumerate(file, start=1):
            parsed = parse_line(line, line_number)
            if parsed is None:
                continue

            group_id, element_id, word = parsed
            group = words_collection.setdefault(group_id, {})

            if element_id not in group:
                group[element_id] = word
            elif not args.join_duplicates:
                raise ValueError(
                    f"Line {line_number}: duplicate ID "
                    f"{group_id}.{element_id}. "
                    "Use --join-duplicates to merge it."
                )
            else:
                existing = group[element_id]
                for field in FIELDS:
                    existing[field] = join_values(word[field], existing[field])

    output_data = {"words_collection": words_collection}

    with Path(args.output).open("w", encoding="utf-8") as file:
        json.dump(output_data, file, ensure_ascii=False, indent=2)
        file.write("\n")


if __name__ == "__main__":
    main()

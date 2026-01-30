#!/usr/bin/env python3
"""Generate a JSON mapping of words to short definitions.

Reads a words file (default: words.txt) and writes to extension/words_meanings.json.
Primary source: WordNet (NLTK). Fallback: Wiktionary (MediaWiki API extracts).

Usage:
    python3 scripts/generate_meanings.py --words-file words.txt --output extension/words_meanings.json

"""

from __future__ import annotations

import argparse
import json
import os
import re
import time
from typing import Dict, Optional

import requests
from bs4 import BeautifulSoup
from tqdm import tqdm

# Try importing NLTK WordNet and ensure data is present
try:
    import nltk
    from nltk.corpus import wordnet as wn
except Exception:
    nltk = None
    wn = None


def ensure_nltk_wordnet():
    global nltk, wn
    if nltk is None:
        import nltk as _nltk
        nltk = _nltk
    try:
        wn.synsets("test")
    except Exception:
        print("Downloading WordNet data (nltk)...")
        nltk.download("wordnet", quiet=True)


WIKT_API = "https://en.wiktionary.org/w/api.php"


def get_wordnet_def(word: str) -> Optional[Dict[str, str]]:
    if wn is None:
        return None
    syns = wn.synsets(word)
    if not syns:
        # try lower/upper forms
        syns = wn.synsets(word.lower())
    if not syns:
        return None
    s = syns[0]
    pos = s.pos()
    pos_map = {"n": "noun", "v": "verb", "a": "adj", "s": "adj(sat)", "r": "adv"}
    return {"def": s.definition(), "pos": pos_map.get(pos, pos), "source": "wordnet"}


def get_wiktionary_def(word: str) -> Optional[Dict[str, str]]:
    params = {
        "action": "query",
        "format": "json",
        "prop": "extracts",
        "exintro": 1,
        "explaintext": 1,
        "redirects": 1,
        "titles": word,
    }
    try:
        r = requests.get(WIKT_API, params=params, timeout=10)
    except requests.RequestException:
        return None
    if r.status_code != 200:
        return None
    data = r.json()
    pages = data.get("query", {}).get("pages", {})
    if not pages:
        return None
    # There is only one page key
    page = next(iter(pages.values()))
    extract = page.get("extract", "").strip()
    if not extract:
        return None
    # attempts to pull the first meaningful sentence (English)
    # split into sentences using a simple regex
    first_sentence = re.split(r"(?<=[.!?])\s+", extract)[0]
    # Remove parentheses and bracketed language notes that often appear in wiktionary extracts
    first_sentence = re.sub(r"\([^)]*\)", "", first_sentence).strip()
    # If the extract contains multiple languages, try to pick out English lines
    # A crude heuristic: if 'English' is in the extract, pull the paragraph after 'English'
    if "English" in extract:
        parts = extract.split("English")
        if len(parts) > 1:
            candidate = parts[1].strip().lstrip(":-\n ")
            candidate = re.split(r"(?<=[.!?])\s+", candidate)[0]
            if candidate:
                first_sentence = candidate
    return {"def": first_sentence, "pos": "", "source": "wiktionary"}


def load_words(path: str) -> list[str]:
    with open(path, "r", encoding="utf-8") as fh:
        words = [w.strip() for w in fh if w.strip()]
    # dedupe and preserve order
    seen = set()
    out = []
    for w in words:
        lw = w.lower()
        if lw not in seen:
            seen.add(lw)
            out.append(lw)
    return out


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--words-file", default="words.txt", help="path to words file (one word per line)")
    p.add_argument("--output", default="extension/words_meanings.json", help="output JSON path")
    p.add_argument("--sleep", type=float, default=0.5, help="sleep seconds between external requests")
    p.add_argument("--max-words", type=int, default=0, help="process only first N words (0 for all)")
    args = p.parse_args()

    words_file = args.words_file
    out_file = args.output

    if not os.path.exists(words_file):
        raise SystemExit(f"Words file not found: {words_file}")

    ensure_nltk_wordnet()

    words = load_words(words_file)
    if args.max_words > 0:
        words = words[: args.max_words]

    results: Dict[str, Dict[str, str]] = {}

    for w in tqdm(words, desc="Words"):
        # try wordnet
        entry = get_wordnet_def(w)
        if entry is None:
            entry = get_wiktionary_def(w)
            # be gentle on the wiki API
            time.sleep(args.sleep)
        if entry is None:
            results[w] = {"def": "", "pos": "", "source": "none"}
        else:
            results[w] = {"def": entry.get("def", ""), "pos": entry.get("pos", ""), "source": entry.get("source", "")}

    os.makedirs(os.path.dirname(out_file), exist_ok=True)
    with open(out_file, "w", encoding="utf-8") as fh:
        json.dump(results, fh, ensure_ascii=False, indent=2)

    print(f"Wrote {len(results)} entries to {out_file}")


if __name__ == "__main__":
    main()

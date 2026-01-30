Words meanings data

This document describes `extension/words_meanings.json`, how it is generated, and how to regenerate it locally.

What it is
- `extension/words_meanings.json` is a compact JSON mapping of words (from `words.txt`) to short definitions.
- Each entry looks like:

```json
"aloft": { "def": "up in or into the air; overhead.", "pos": "adverb/adjective", "source": "wordnet" }
```

Generation
- Primary source: WordNet (via NLTK).
- Fallback: Wiktionary extracts via the MediaWiki API.
- Script: `scripts/generate_meanings.py` — reads a words file and writes the JSON mapping.

Regenerating locally
1. Activate the project's virtualenv.
2. Install dependencies: `pip install nltk requests beautifulsoup4 tqdm`.
3. Run:

```bash
python scripts/generate_meanings.py --words-file words.txt --output extension/words_meanings.json
```

Automation
- A GitHub Actions workflow (`.github/workflows/generate_meanings.yml`) runs weekly and can be triggered manually to regenerate the file and commit changes when they occur.

Notes
- The script is conservative: if a definition cannot be found, the entry will have an empty `def` and `source` set to `none`.
- The JSON is intentionally compact to keep the extension lightweight and offline-friendly.

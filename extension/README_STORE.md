Store-ready checklist (quick)

1. Update `extension/store_listing.json` with a support email and hosted privacy policy URL.
2. Add screenshots to `extension/screenshots/`.
3. Confirm app name (we recommend including “(Unofficial)”).
4. Run `./scripts/pack_extension.sh` to create `dist/wordle-wizard-<version>.zip` for upload.
5. In the Chrome Developer Dashboard: fill in listing text, upload screenshots, set categories, and add the privacy policy URL.
6. Run `python3 ../scripts/validate_manifest_refs.py extension/build/manifest.json` before packaging to ensure all referenced files are present.
7. Use the `REVIEWER_REPLY.md` file at the repo root as the text to paste into the developer reply when resubmitting.

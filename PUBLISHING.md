Chrome Web Store publishing checklist

This document outlines the steps and assets required to publish the extension to the Chrome Web Store (CWS).

Required assets & metadata
- Title and short description (store listing) — concise and clear.
- Full description (up to 16k characters) with features, privacy summary, and support contact.
- Icons: provide at least a 128x128 PNG. Add additional sizes if desired (48x48, 96x96) in `extension/icons/`.
- Promotional images/screenshots: 1–8 screenshots showing your extension in action. Place in `extension/screenshots/`.
- Privacy policy: host a privacy page (or use the repo `privacy.md` as the content and host it on a public url) and link to it in the store listing.
- Contact email for developer account.

Permissions review & manifest
- Minimize the permissions requested in `manifest.json` (only request `storage`, `activeTab`, `scripting`, `clipboardWrite`, and explicit host permissions if needed).
- Make sure `host_permissions` contains only domains required for the extension to run and document why each host permission is needed in `PUBLISHING.md`.
- We recommend including “(Unofficial)” in the extension title to reduce trademark risks when referring to Wordle or other trademarked games.
- If you want to protect intellectual property, consider using the provided build step (`scripts/build_extension.sh`) to minify/obfuscate the client-side JS. Understand that obfuscation only raises the barrier; for true secrecy move sensitive logic server-side and document privacy implications.
- Ensure `web_accessible_resources` includes files that need to be fetched by the page (we already added `words_meanings.json`).
- Document any optional external requests (e.g., Wiktionary lookups) in the privacy policy and store listing; make it clear these are user-initiated and not automatic.

Pre-publish checks
- Manual QA: install unpacked, run through Wordle flows (no guesses, typing, validated guesses, win/lose flows) and check UI and logs.
- Security/CSP: avoid injecting inline scripts into pages (we now use DOM attributes for debug), and ensure no remote code is executed.
- Privacy: ensure no user data is transmitted externally; if it is, document and get consent.
- Add a short test plan and screenshot files to `extension/screenshots/`.

CI / Automation (suggested)
- Add a packaging workflow that zips the `extension/` folder and uploads it as a GitHub Actions build artifact.
- Optionally add a separate workflow for uploading to CWS if you have service account secrets (not included in this repo by default).

Publishing steps (manual)
1. Create a Chrome Developer dashboard account (one-time fee) and register the developer account.
2. Create a new item in the store and upload the ZIP from the CI artifact or a local ZIP file.
3. Fill out listing details, add screenshots, set the appropriate category, and provide privacy policy and contact email.
4. Submit for review.

Notes
- We intentionally avoid automated uploads to the store in this repository; manual approval and secure secrets are required to upload automatically.
- After publishing: monitor user feedback and prepare updates via normal release PRs (bump version in `manifest.json`).

Build & obfuscation notes

This project provides an optional build step that minifies and obfuscates
JavaScript for packaging. Important notes:

- Obfuscation raises the difficulty for casual inspection, but it does NOT
  make reverse engineering impossible. Any client-side code can be recovered
  with sufficient effort.

- For true secrecy of the core algorithm you must move critical logic to a
  server-side component and call it via a controlled API (with authentication
  and rate limiting). This requires careful privacy disclosures and hosting.

- The build script is at `scripts/build_extension.sh` and uses `terser` and
  `javascript-obfuscator` (via `npx`) to produce `extension/build/` with
  `*.obf.js` files and a modified `manifest.json` that references them.

- The packaging script `scripts/pack_extension.sh` will prefer `extension/build`
  when present so the stored ZIP will contain the obfuscated artifacts.

- Consider changing the license if you want to restrict reuse (current
  LICENSE is MIT which permits reuse). Also consider adding a CLA or
  contributor agreements if needed.

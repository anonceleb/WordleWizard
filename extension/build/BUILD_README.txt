This folder contains a minified and optionally obfuscated build of the extension
scripts. It is intended for packaging for publish. Obfuscation raises the bar
against casual inspection but does NOT prevent determined reverse engineering.

Tools used: terser (minify) + javascript-obfuscator (obfuscate) via npx. If these
are not available on your system, the build falls back to minified files.

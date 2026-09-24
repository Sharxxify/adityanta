# pptxtojson (vendored)

PowerPoint (.pptx) parser, vendored from
https://github.com/pipipi-pikachu/pptxtojson v2.2.0 (MIT licence, see LICENSE).

It is kept inside this repo so we can fix fidelity bugs. Adityanta-specific
changes are marked with `// ADITYANTA:` comments. The adapter that converts
its output into Adityanta slide elements lives in `src/utils/pptxImport.js`.

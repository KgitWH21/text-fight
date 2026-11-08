Craft data: https://github.com/KgitWH21/sentence_trainer/blob/main/index.html
Retrieved from the actual source on 2026-11-08. Source file Git blob SHA:
`a4a1c9f128b83bc3f621a03f159d9567318c4918`.

All entries and their original `type` / `example` explanations are retained:
24 starters, 101 craft devices, 20 enders, 341 training prompts,
376 sentence enhancements, and 88 registers (950 total).
The source repository was read only and was not modified.

To refresh from a separately downloaded source snapshot:
`node scripts/import-sentence-trainer.mjs /path/to/sentence_trainer/index.html`

`words.json` is a separately authored offline vocabulary deck for Text Fight.
It contains the original 168 entries plus 1,000 additional unique words with
short explanations (1,168 total). The expansion mixes concrete objects and
places, nature and food, modern objects, expressive verbs, textures, sounds,
and moods. No Wordnik API data was used to create the expansion.

Rebuild the deck with `node scripts/make-words.mjs`. The original entries are
retained in that script; the 1,000 additional entries are maintained in
`scripts/offline-words-extra.txt`. The generator rejects duplicates and missing
explanations before writing the bundled JSON.

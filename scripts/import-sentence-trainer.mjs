// Read a downloaded snapshot; never writes to the original repository.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import vm from 'node:vm';
const filename = process.argv[2];
if (!filename) throw Error('Usage: node scripts/import-sentence-trainer.mjs /path/to/sentence_trainer/index.html');
const source = await readFile(filename, 'utf8');
const block = source.slice(source.indexOf('const starters ='), source.indexOf('const elements ='));
const deck = vm.runInNewContext(block + ';({starters,craftDevices,enders,prompts,sentenceEnhancements,registers})', {}, { timeout: 1000 });
await mkdir('data', { recursive: true });
await writeFile('data/sentence-trainer.json', JSON.stringify(deck, null, 2) + '\n');
console.log(Object.fromEntries(Object.entries(deck).map(([key, entries]) => [key, entries.length])));

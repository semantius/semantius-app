/**
 * Writes formats.json from the format list in src/vocabulary.json (properties.format.oneOf),
 * for the GUI and the Semantius backend:
 *
 *   { "<format>": { "type": <JSON type or type list>, "description": "..." } }
 *
 * vocabulary.json is the source; never edit formats.json by hand.
 *
 *   node scripts/generate-formats.js          write formats.json
 *   node scripts/generate-formats.js --check  exit 1 when formats.json is out of date
 */
const fs = require('fs');
const path = require('path');

const packageDir = path.resolve(__dirname, '..');
const vocabularyPath = path.join(packageDir, 'src', 'vocabulary.json');
const formatsPath = path.join(packageDir, 'formats.json');

const vocabulary = JSON.parse(fs.readFileSync(vocabularyPath, 'utf8'));
const formats = Object.fromEntries(
  vocabulary.properties.format.oneOf.map((entry) => [entry.const, { type: entry.jsonType, description: entry.description }])
);
const content = JSON.stringify(formats, null, 2) + '\n';

if (process.argv.includes('--check')) {
  const current = fs.existsSync(formatsPath) ? fs.readFileSync(formatsPath, 'utf8').replace(/\r\n/g, '\n') : '';
  if (current !== content) {
    console.error('formats.json is out of date with src/vocabulary.json. Run: pnpm generate:formats');
    process.exit(1);
  }
} else {
  fs.writeFileSync(formatsPath, content);
  console.log(`Wrote ${Object.keys(formats).length} formats to formats.json`);
}

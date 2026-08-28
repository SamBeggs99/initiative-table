/**
 * Map a raw Archives of Nethys creature dump into src/data/nethys-monster-core.json.
 *
 * Input: scripts/nethys-creatures-raw.json (gitignored; pulled from 2e.aonprd.com ES).
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  nethysToStatBlock,
  uniquifyNethysCreatureId,
  type NethysCreature,
} from '../src/lib/bestiary/normalize-nethys.ts';

const root = path.resolve(import.meta.dirname, '..');
const inputPath = path.join(root, 'scripts', 'nethys-creatures-raw.json');
const outputPath = path.join(root, 'src', 'data', 'nethys-monster-core.json');

const raw = JSON.parse(fs.readFileSync(inputPath, 'utf8')) as (NethysCreature & {
  _id?: string;
})[];

const taken = new Set<string>();
const out = [];
let skipped = 0;
for (const row of raw) {
  const mapped = nethysToStatBlock(row, 'synced');
  if (!mapped) {
    skipped += 1;
    continue;
  }
  const unique = uniquifyNethysCreatureId(
    mapped,
    row._id || row.id || row.name || 'creature',
    taken,
  );
  taken.add(unique.id);
  out.push(unique);
}

fs.writeFileSync(outputPath, `${JSON.stringify(out)}\n`);
console.log(
  `Wrote ${out.length} creatures (${skipped} skipped) → ${path.relative(root, outputPath)}`,
);

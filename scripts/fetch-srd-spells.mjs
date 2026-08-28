/**
 * Fetches Open5e SRD 5.1 spells and writes a small offline bundle.
 * Run from repo root: node scripts/fetch-srd-spells.mjs
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const KEEP = new Set(
  [
    'Fire Bolt',
    'Sacred Flame',
    'Guidance',
    'Light',
    'Mage Hand',
    'Prestidigitation',
    'Shocking Grasp',
    'Ray of Frost',
    'Magic Missile',
    'Cure Wounds',
    'Shield',
    'Healing Word',
    'Burning Hands',
    'Sleep',
    'Bless',
    'Faerie Fire',
    'Thunderwave',
    'Detect Magic',
    'Mage Armor',
    'Scorching Ray',
    'Hold Person',
    'Misty Step',
    'Invisibility',
    'Spiritual Weapon',
    'Shatter',
    'Web',
    'Fireball',
    'Counterspell',
    'Fly',
    'Haste',
    'Hypnotic Pattern',
    'Lightning Bolt',
    'Dispel Magic',
    'Revivify',
    'Greater Invisibility',
    'Dimension Door',
    'Polymorph',
    'Ice Storm',
    'Banishment',
    'Cone of Cold',
    'Wall of Force',
    'Mass Cure Wounds',
    'Disintegrate',
    'Heal',
    'Chain Lightning',
    'Finger of Death',
    'Teleport',
    'Power Word Kill',
    'Wish',
    'Meteor Swarm',
  ].map((n) => n.toLowerCase()),
);

function yes(v) {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string') return /^(yes|true)$/i.test(v.trim());
  return false;
}

function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'spell';
}

function toSpell(raw) {
  const sourceSlug = raw.document__slug || 'wotc-srd';
  const slug = raw.slug || slugify(raw.name);
  const level =
    typeof raw.level_int === 'number'
      ? raw.level_int
      : typeof raw.spell_level === 'number'
        ? raw.spell_level
        : 0;
  const classes = Array.isArray(raw.spell_lists) && raw.spell_lists.length
    ? raw.spell_lists
    : String(raw.dnd_class || '')
        .split(',')
        .map((c) => c.trim())
        .filter(Boolean);
  const mat = (raw.material || '').trim();
  const comps = (raw.components || '').trim();
  const components =
    mat && comps && !comps.toLowerCase().includes(mat.toLowerCase())
      ? `${comps} (${mat})`
      : comps || (mat ? `M (${mat})` : '');
  const higher = (raw.higher_level || '').trim();
  return {
    id: `dnd5e:${sourceSlug}:${slug}`,
    system: 'dnd5e',
    origin: 'bundled',
    slug,
    name: raw.name,
    level,
    school: (raw.school || 'evocation').trim(),
    castingTime: (raw.casting_time || '1 action').trim(),
    range: (raw.range || '').trim(),
    components,
    duration: (raw.duration || '').trim(),
    concentration: yes(raw.concentration),
    ritual: yes(raw.ritual),
    classes,
    desc: (raw.desc || '').trim(),
    higherLevel: higher || undefined,
    source: raw.document__title || '5e SRD',
    createdAt: 1,
    updatedAt: 1,
  };
}

const here = dirname(fileURLToPath(import.meta.url));
const outPath = join(here, '..', 'src', 'data', 'srd-spells-5e.json');

let url = 'https://api.open5e.com/v1/spells/?document__slug=wotc-srd&limit=100';
const kept = [];

while (url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  const data = await res.json();
  for (const raw of data.results ?? []) {
    if (KEEP.has(String(raw.name).toLowerCase())) kept.push(toSpell(raw));
  }
  url = data.next ?? null;
  process.stdout.write(`fetched page, kept ${kept.length}\n`);
}

kept.sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
writeFileSync(outPath, `${JSON.stringify(kept, null, 2)}\n`);
process.stdout.write(`wrote ${kept.length} spells to ${outPath}\n`);

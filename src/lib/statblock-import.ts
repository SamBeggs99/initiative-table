import type { Ability, Entry, StatBlock } from '../types';
import { averageOf } from './dice';
import {
  enrichEntry,
  parseLegendaryCount,
  parseLimitedUses,
} from './parse';

export type FieldConfidence = 'high' | 'medium' | 'low' | 'missing';

export interface ParseStatBlockResult {
  statBlock: StatBlock;
  confidence: Record<string, FieldConfidence>;
  unparsed: string[];
}

const ABILITIES: Ability[] = ['str', 'dex', 'con', 'int', 'wis', 'cha'];

const SECTION_HEADERS =
  /^(actions|bonus actions|reactions|legendary actions|lair actions)\s*$/i;

function normalize(raw: string): string {
  return raw
    .replace(/\u00a0/g, ' ')
    .replace(/[−–—]/g, '-')
    .replace(/\r\n/g, '\n')
    .replace(/\t/g, ' ')
    .trim();
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'creature';
}

function emptyAbilities(): Record<Ability, number> {
  return { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 };
}

function parseSizeTypeAlignment(line: string): {
  size: string;
  type: string;
  alignment: string;
  confidence: FieldConfidence;
} {
  const m = line.match(
    /^(Tiny|Small|Medium|Large|Huge|Gargantuan)\s+(.+?),\s*(.+)$/i,
  );
  if (!m) {
    return { size: '', type: '', alignment: '', confidence: 'missing' };
  }
  return {
    size: m[1]!,
    type: m[2]!.trim(),
    alignment: m[3]!.trim(),
    confidence: 'high',
  };
}

function parseAc(line: string): { ac: number; acDesc?: string; confidence: FieldConfidence } | null {
  const m = line.match(/^Armor Class\s+(\d+)(?:\s*\((.+)\))?/i);
  if (!m) return null;
  return {
    ac: Number(m[1]),
    acDesc: m[2]?.trim(),
    confidence: 'high',
  };
}

function parseHp(line: string): {
  hpAvg: number;
  hitDice: string;
  confidence: FieldConfidence;
} | null {
  const m = line.match(
    /^Hit Points\s+(\d+)(?:\s*\(\s*(\d*d\d+(?:\s*[+-]\s*\d+)?)\s*\))?/i,
  );
  if (!m) return null;
  const hitDice = m[2] ? m[2].replace(/\s+/g, '') : '';
  return {
    hpAvg: Number(m[1]),
    hitDice,
    confidence: m[2] ? 'high' : 'medium',
  };
}

function parseSpeed(line: string): {
  speed: Record<string, number | string>;
  confidence: FieldConfidence;
} | null {
  const m = line.match(/^Speed\s+(.+)/i);
  if (!m) return null;
  const speed: Record<string, number | string> = {};
  const parts = m[1]!.split(',').map((p) => p.trim()).filter(Boolean);
  for (const part of parts) {
    const walk = part.match(/^(\d+)\s*ft\.?$/i);
    if (walk) {
      speed.walk = Number(walk[1]);
      continue;
    }
    const named = part.match(/^([a-z]+)\s+(\d+)\s*ft\.?/i);
    if (named) {
      speed[named[1]!.toLowerCase()] = Number(named[2]);
      continue;
    }
    speed[part] = part;
  }
  return { speed, confidence: Object.keys(speed).length ? 'high' : 'low' };
}

function extractAbilityScores(text: string): {
  abilities: Record<Ability, number>;
  confidence: FieldConfidence;
  consumed: string[];
} {
  const abilities = emptyAbilities();
  const consumed: string[] = [];

  // Header row then scores: STR DEX CON INT WIS CHA\n8 (-1) 14 (+2) ...
  const block = text.match(
    /STR\s+DEX\s+CON\s+INT\s+WIS\s+CHA\s*\n\s*((?:\d+\s*\([+-]?\d+\)\s*){6})/i,
  );
  if (block) {
    const nums = [...block[1]!.matchAll(/(\d+)\s*\([+-]?\d+\)/g)].map((x) => Number(x[1]));
    if (nums.length === 6) {
      ABILITIES.forEach((a, i) => {
        abilities[a] = nums[i]!;
      });
      consumed.push(block[0]);
      return { abilities, confidence: 'high', consumed };
    }
  }

  // Inline: STR 8 (-1) DEX 14 (+2) ...
  const inline = text.match(
    /STR\s+(\d+)\s*\([+-]?\d+\)\s*DEX\s+(\d+)\s*\([+-]?\d+\)\s*CON\s+(\d+)\s*\([+-]?\d+\)\s*INT\s+(\d+)\s*\([+-]?\d+\)\s*WIS\s+(\d+)\s*\([+-]?\d+\)\s*CHA\s+(\d+)\s*\([+-]?\d+\)/i,
  );
  if (inline) {
    ABILITIES.forEach((a, i) => {
      abilities[a] = Number(inline[i + 1]);
    });
    consumed.push(inline[0]);
    return { abilities, confidence: 'high', consumed };
  }

  // Separate lines: STR\n19 (+4)\nDEX\n12 (+1)...
  const separate = text.match(
    /STR\s*\n\s*(\d+)\s*\([+-]?\d+\)\s*\n\s*DEX\s*\n\s*(\d+)\s*\([+-]?\d+\)\s*\n\s*CON\s*\n\s*(\d+)\s*\([+-]?\d+\)\s*\n\s*INT\s*\n\s*(\d+)\s*\([+-]?\d+\)\s*\n\s*WIS\s*\n\s*(\d+)\s*\([+-]?\d+\)\s*\n\s*CHA\s*\n\s*(\d+)\s*\([+-]?\d+\)/i,
  );
  if (separate) {
    ABILITIES.forEach((a, i) => {
      abilities[a] = Number(separate[i + 1]);
    });
    consumed.push(separate[0]);
    return { abilities, confidence: 'high', consumed };
  }

  return { abilities, confidence: 'missing', consumed };
}

function parseSkillOrSaveLine(
  line: string,
  label: RegExp,
): Record<string, number> | null {
  const m = line.match(label);
  if (!m) return null;
  const out: Record<string, number> = {};
  const re = /([A-Za-z][A-Za-z\s]*?)\s+([+-]\d+)/g;
  let x: RegExpExecArray | null;
  while ((x = re.exec(m[1]!)) !== null) {
    out[x[1]!.trim()] = Number(x[2]);
  }
  return out;
}

function parseSaves(line: string): Partial<Record<Ability, number>> | null {
  const raw = parseSkillOrSaveLine(line, /^Saving Throws\s+(.+)/i);
  if (!raw) return null;
  const map: Record<string, Ability> = {
    str: 'str',
    strength: 'str',
    dex: 'dex',
    dexterity: 'dex',
    con: 'con',
    constitution: 'con',
    int: 'int',
    intelligence: 'int',
    wis: 'wis',
    wisdom: 'wis',
    cha: 'cha',
    charisma: 'cha',
  };
  const saves: Partial<Record<Ability, number>> = {};
  for (const [k, v] of Object.entries(raw)) {
    const ab = map[k.toLowerCase()];
    if (ab) saves[ab] = v;
  }
  return saves;
}

function parseCr(line: string): { cr: string; confidence: FieldConfidence } | null {
  const m = line.match(/^(?:Challenge|CR)\s+([\d/]+)\s*(?:\([^)]*\))?/i);
  if (!m) return null;
  return { cr: m[1]!, confidence: 'high' };
}

function splitEntries(body: string): Entry[] {
  const text = body.trim();
  if (!text) return [];
  // Entries start with "Name." at beginning of a line / paragraph
  const parts = text.split(/(?=^[A-Z][^\n.]{0,80}\.)/m).map((p) => p.trim()).filter(Boolean);
  const entries: Entry[] = [];
  for (const part of parts) {
    const m = part.match(/^([^.]+)\.\s*([\s\S]*)$/);
    if (m) {
      const name = m[1]!.trim();
      const desc = m[2]!.trim();
      entries.push(enrichEntry({ name, desc }));
    } else {
      entries.push({ name: 'Trait', desc: part });
    }
  }
  return entries;
}

/**
 * Parse pasted plain-text 5e stat blocks.
 * Returns a StatBlock plus per-field confidence and any leftover text.
 */
export function parseStatBlockText(raw: string): ParseStatBlockResult {
  const text = normalize(raw);
  const confidence: Record<string, FieldConfidence> = {};
  const unparsed: string[] = [];
  const lines = text.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);

  const name = lines[0] ?? 'Unknown Creature';
  confidence.name = lines[0] ? 'high' : 'missing';

  let idx = 1;
  let size = '';
  let type = '';
  let alignment = '';
  if (lines[idx]) {
    const sta = parseSizeTypeAlignment(lines[idx]!);
    size = sta.size;
    type = sta.type;
    alignment = sta.alignment;
    confidence.size = sta.confidence;
    confidence.type = sta.confidence;
    confidence.alignment = sta.confidence;
    if (sta.confidence !== 'missing') idx += 1;
    else {
      confidence.size = 'missing';
      confidence.type = 'missing';
      confidence.alignment = 'missing';
    }
  } else {
    confidence.size = 'missing';
    confidence.type = 'missing';
    confidence.alignment = 'missing';
  }

  let ac = 10;
  let acDesc: string | undefined;
  confidence.ac = 'missing';
  let hpAvg = 1;
  let hitDice = '';
  confidence.hpAvg = 'missing';
  confidence.hitDice = 'missing';
  let speed: Record<string, number | string> = {};
  confidence.speed = 'missing';

  const saves: Partial<Record<Ability, number>> = {};
  const skills: Record<string, number> = {};
  let vulnerabilities: string | undefined;
  let resistances: string | undefined;
  let immunities: string | undefined;
  let conditionImmunities: string | undefined;
  let senses = '';
  let languages = '';
  let cr = '0';
  confidence.cr = 'missing';
  confidence.senses = 'missing';
  confidence.languages = 'missing';

  // Consume labelled header lines until abilities or a section
  while (idx < lines.length) {
    const line = lines[idx]!;
    if (SECTION_HEADERS.test(line)) break;
    if (/^STR(\s+DEX|\s*$)/i.test(line)) break;

    const acParsed = parseAc(line);
    if (acParsed) {
      ac = acParsed.ac;
      acDesc = acParsed.acDesc;
      confidence.ac = acParsed.confidence;
      idx += 1;
      continue;
    }
    const hpParsed = parseHp(line);
    if (hpParsed) {
      hpAvg = hpParsed.hpAvg;
      hitDice = hpParsed.hitDice;
      confidence.hpAvg = 'high';
      confidence.hitDice = hpParsed.confidence;
      idx += 1;
      continue;
    }
    const speedParsed = parseSpeed(line);
    if (speedParsed) {
      speed = speedParsed.speed;
      confidence.speed = speedParsed.confidence;
      idx += 1;
      continue;
    }
    break;
  }

  // Ability block — operate on remaining joined text for flexible layouts
  const remainingText = lines.slice(idx).join('\n');
  const abilityResult = extractAbilityScores(remainingText);
  const abilities = abilityResult.abilities;
  confidence.abilities = abilityResult.confidence;

  let afterAbilities = remainingText;
  for (const chunk of abilityResult.consumed) {
    afterAbilities = afterAbilities.replace(chunk, '\n');
  }

  // Split into pre-section body and named sections
  const sectionSplit = afterAbilities.split(
    /\n(?=(?:Actions|Bonus Actions|Reactions|Legendary Actions|Lair Actions)\s*$)/im,
  );
  const preSection = sectionSplit[0] ?? '';
  const sectionChunks = sectionSplit.slice(1);

  const preLines = preSection
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  const traitLines: string[] = [];
  for (const line of preLines) {
    if (/^STR(\s+DEX)?$/i.test(line)) continue;
    if (/^\d+\s*\([+-]?\d+\)(\s+\d+\s*\([+-]?\d+\))*$/.test(line)) continue;

    const saveParsed = parseSaves(line);
    if (saveParsed) {
      Object.assign(saves, saveParsed);
      confidence.saves = 'high';
      continue;
    }
    const skillParsed = parseSkillOrSaveLine(line, /^Skills\s+(.+)/i);
    if (skillParsed) {
      Object.assign(skills, skillParsed);
      confidence.skills = 'high';
      continue;
    }
    const vuln = line.match(/^Damage Vulnerabilit(?:y|ies)\s+(.+)/i);
    if (vuln) {
      vulnerabilities = vuln[1]!.trim();
      confidence.vulnerabilities = 'high';
      continue;
    }
    const resist = line.match(/^Damage Resistances?\s+(.+)/i);
    if (resist) {
      resistances = resist[1]!.trim();
      confidence.resistances = 'high';
      continue;
    }
    const immune = line.match(/^Damage Immunities?\s+(.+)/i);
    if (immune) {
      immunities = immune[1]!.trim();
      confidence.immunities = 'high';
      continue;
    }
    const condImm = line.match(/^Condition Immunities?\s+(.+)/i);
    if (condImm) {
      conditionImmunities = condImm[1]!.trim();
      confidence.conditionImmunities = 'high';
      continue;
    }
    const senseM = line.match(/^Senses\s+(.+)/i);
    if (senseM) {
      senses = senseM[1]!.trim();
      confidence.senses = 'high';
      continue;
    }
    const langM = line.match(/^Languages?\s+(.+)/i);
    if (langM) {
      languages = langM[1]!.trim();
      confidence.languages = 'high';
      continue;
    }
    const crParsed = parseCr(line);
    if (crParsed) {
      cr = crParsed.cr;
      confidence.cr = crParsed.confidence;
      continue;
    }

    // Unlabelled trait paragraphs after CR
    traitLines.push(line);
  }

  const traits = splitEntries(traitLines.join('\n'));
  confidence.traits = traits.length ? 'high' : 'missing';

  let actions: Entry[] = [];
  let bonusActions: Entry[] = [];
  let reactions: Entry[] = [];
  let legendaryActions: Entry[] = [];
  let legendaryDesc: string | undefined;

  for (const chunk of sectionChunks) {
    const chunkLines = chunk.split('\n').map((l) => l.trim()).filter(Boolean);
    if (chunkLines.length === 0) continue;
    const header = chunkLines[0]!;
    const body = chunkLines.slice(1).join('\n');

    if (/^actions$/i.test(header)) {
      actions = splitEntries(body);
      confidence.actions = actions.length ? 'high' : 'low';
    } else if (/^bonus actions$/i.test(header)) {
      bonusActions = splitEntries(body);
      confidence.bonusActions = bonusActions.length ? 'high' : 'low';
    } else if (/^reactions$/i.test(header)) {
      reactions = splitEntries(body);
      confidence.reactions = reactions.length ? 'high' : 'low';
    } else if (/^legendary actions$/i.test(header)) {
      // First paragraph often describes count / rules
      const entries = splitEntries(body);
      if (entries.length && !/^[A-Z].*\(.*\)$/.test(entries[0]!.name) && entries[0]!.desc === '') {
        // unlikely
      }
      // If body starts with a sentence (not Name.), treat as legendaryDesc
      const bodyTrim = body.trim();
      const firstEntryMatch = bodyTrim.match(/^([A-Z][^\n.]{0,80}\.)/);
      if (bodyTrim && !firstEntryMatch) {
        legendaryDesc = bodyTrim;
        legendaryActions = [];
      } else if (bodyTrim && !/^[A-Z][^\n.]{0,60}\./.test(bodyTrim.split('\n')[0] ?? '')) {
        const paraEnd = bodyTrim.search(/\n[A-Z]/);
        if (paraEnd > 0) {
          legendaryDesc = bodyTrim.slice(0, paraEnd).trim();
          legendaryActions = splitEntries(bodyTrim.slice(paraEnd));
        } else {
          legendaryDesc = bodyTrim;
        }
      } else {
        // Check if first "entry" is actually descriptive prose without a short name
        if (
          entries[0] &&
          entries[0].name.length > 40
        ) {
          legendaryDesc = `${entries[0].name}. ${entries[0].desc}`.trim();
          legendaryActions = entries.slice(1);
        } else {
          legendaryActions = entries;
          if (bodyTrim.match(/can take\s+\d+\s+legendary actions/i)) {
            const before = bodyTrim.split(/(?=^[A-Z][^\n.]{0,80}\.)/m)[0]?.trim();
            if (before && !/^[A-Z][^\n.]{0,40}\.\s/.test(before)) {
              legendaryDesc = before;
              legendaryActions = splitEntries(bodyTrim.slice(before.length));
            }
          }
        }
      }
      confidence.legendaryActions = 'high';
      void parseLegendaryCount(legendaryDesc ?? body);
    } else {
      unparsed.push(chunk);
    }
  }

  // Anything left that looked like trait lines before CR with no structure
  if (confidence.abilities === 'missing' && traitLines.length === 0) {
    for (const line of preLines) {
      if (
        !/^Armor Class/i.test(line) &&
        !/^Hit Points/i.test(line) &&
        !/^Speed/i.test(line) &&
        !/^STR/i.test(line)
      ) {
        if (!unparsed.includes(line)) unparsed.push(line);
      }
    }
  }

  // For mystery / minimal blocks: leftover lines go to unparsed
  if (confidence.size === 'missing' && lines.length > 1) {
    for (const line of lines.slice(1)) {
      if (!unparsed.includes(line)) unparsed.push(line);
    }
  }

  // Fill hitDice average check — if we have hitDice but no avg mismatch, fine
  if (hitDice && confidence.hpAvg === 'missing') {
    try {
      hpAvg = Math.floor(averageOf(hitDice));
      confidence.hpAvg = 'medium';
    } catch {
      /* ignore */
    }
  }

  const slug = slugify(name);
  const limited = traits
    .map((t) => parseLimitedUses(`${t.name}. ${t.desc}`))
    .filter(Boolean);
  void limited;

  const statBlock: StatBlock = {
    id: crypto.randomUUID(),
    system: 'dnd5e',
    origin: 'homebrew',
    slug,
    name,
    size,
    type,
    alignment,
    ac,
    acDesc,
    hpAvg,
    hitDice,
    speed,
    abilities,
    saves,
    skills,
    vulnerabilities,
    resistances,
    immunities,
    conditionImmunities,
    senses,
    languages,
    cr,
    traits,
    actions,
    bonusActions,
    reactions,
    legendaryDesc,
    legendaryActions,
    source: 'Homebrew',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  return { statBlock, confidence, unparsed };
}

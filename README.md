# Dungeon Master MultiTool

A D&D 5e combat manager and campaign multi-tool for DMs running games live at the table.
Pathfinder 2e is supported per-campaign through a system adapter (conditions, three-action
economy, dying/wounded, encounter XP budgets, perception-based initiative). The PF2e
bestiary is homebrew/paste until an Archives of Nethys sync lands.

Built for dim light, one hand free, mid-sentence at the table — glanceable HP, fast damage,
and prep that loads in one click.

## Run

```bash
npm install
npm run dev
npm test
npm run build
```

Static output lands in `dist/` (no Node server). With no env vars the table stays
local-only in this browser. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
to enable email/password login and a per-user cloud copy of your campaigns.

## Hosting (login + save)

1. Create a free [Supabase](https://supabase.com) project. Leave Email auth on.
2. SQL Editor: run [`supabase/schema.sql`](supabase/schema.sql) (`user_blobs` + row-level security).
3. Project Settings → API: copy **Project URL** and **anon public** key into the host
   as `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (see `.env.example`). The anon
   key is meant to live in the website; RLS is the lock.
4. GitHub Actions builds `dist/` and deploys to GitHub Pages. Set repository secrets
   `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (same values as `.env.local`).
5. In Supabase → Authentication → URL Configuration, set **Site URL** to
   `https://dm-multitool.com` and add these **Redirect URLs**:
   `https://dm-multitool.com/**`, `https://www.dm-multitool.com/**`,
   `http://localhost:5188/**`.
6. Open the live URL, log in with the account you already created. Hit **Sync** once
   per system for SRD catalogs (those stay a per-device download).

Live site: https://dm-multitool.com

Optional later: Authentication → disable new sign-ups until you want other DMs.

## Where data lives

| What | Where |
|------|--------|
| Campaigns, party, NPCs, combat, encounter library, settings | `localStorage` (Zustand persist), plus a per-user cloud row when Supabase env is set |
| Homebrew creatures / spells | IndexedDB, copied into the same cloud row (not the full SRD catalogs) |
| Bestiary (synced + bundled SRD) | IndexedDB via Dexie — **Sync** on each device |
| Spells (synced 5e SRD + synced PF2e Player Core + bundled) | IndexedDB via Dexie (`initiative-table-spells`) — **Sync** on each device |
| Session log | In-memory for the session (export as markdown anytime) |

- Combatant `statBlock` is an **embedded copy** — mid-session bestiary sync cannot rewrite an
  in-progress fight.
- Encounter library is **global**, not campaign-owned. Tag encounters for Solamento, Uldir,
  both, or neither.
- Campaign export/import re-keys party and NPC ids and remaps combat links + NPC relationships
  so mid-fight exports still write HP back after import.
- See `OGL-NOTICE.txt` for SRD / OGL / ORC attribution of bundled and synced catalogs
  monsters and spells, and Archives of Nethys Player Core spells.

### Monster data sources

- **Bundled:** ~25 SRD creatures in `src/data/srd-monsters.json` for offline first run.
- **Synced (5e):** Open5e `https://api.open5e.com/v1/monsters/` — full catalog, fetched in
  parallel pages. Library auto-syncs once if you’ve never pulled it; **Sync** re-runs.
  Sync replaces only `origin: 'synced'` rows; homebrew is never touched.
- **Homebrew:** You entered it (editor, paste, or import). Campaign-scoped or global.

This app never invents monster or spell stats.

### Spell catalog

- **Bundled 5e:** common SRD spells in `src/data/srd-spells-5e.json` for offline first run.
- **Synced (5e):** 5e-bits D&D 5e SRD API `https://www.dnd5eapi.co/api/2014/spells` —
  SRD 5.1 pull (auto once, or **Sync**). Homebrew is never touched. Creature
  spell refs keep `dnd5e:wotc-srd:…` ids.
- **Synced (PF2e):** Archives of Nethys Elasticsearch
  `https://elasticsearch.aonprd.com/aon/_search` — **Player Core** and
  **Player Core 2** only (auto once, or **Sync**). Legacy entries that point at a
  remaster id are skipped. Homebrew is never touched.
- **Bundled PF2e:** Player Core subset in `src/data/srd-spells-pf2e.json` for offline
  first run (superseded by a matching synced slug).
- **Homebrew:** you entered it. Campaign-scoped.

Search lives under left roster **Library → Spells**. Press `/` to jump to creatures.
Ctrl+K → `spell fireball` opens a preview.

### D&D Beyond import

D&D Beyond has **no** public, documented API. Staff have pointed at ToS §2.2. This app does
**not** scrape or auto-fetch D&D Beyond.

Party import is **user-initiated paste only**: open a public character sheet, append `/json`
to the URL, copy the JSON, paste it into Dungeon Master MultiTool. All DDB field knowledge lives in
`src/lib/import/ddb.ts` so a shape change loses one convenience, not the app.

PF2e campaigns use the same paste pattern for Pathbuilder 2e export JSON
(`src/lib/import/pathbuilder.ts`).

## Headline features

- **Left roster** — Players, NPCs, **Library** (creatures + spells), and Notes. In combat
  the roster collapses to a rail; `/` or **L** opens creatures to add enemies.
- **Quick party HP** — damage / heal / temp from the roster without opening the full sheet.
  In-combat edits route to the linked combatant.
- **Condition expiry** — ends on round or end of a combatant’s turn; announced in the log.
- **Encounter library** — prep once, load with HP rolled, initiative filled (system-aware),
  clocks armed, and optional **loot / treasure** lines. Hard system gate (no 5e↔PF2e
  conversion). Dependencies validated before the current fight is wiped.
- **Loot** — plan drops on the encounter; award from the tracker (or when ending / clearing).
  Awarded lines pin into Notes as `Loot — {encounter}`. Unawarded loot is discarded if you
  choose to continue without awarding.
- **Sheet vs live party** — combat never writes sheet `maxHp` / AC; persistent NPC HP
  write-back on end fight / end session.
- **Ability scores** — D&D 5e and PF2e both use scores (not raw modifiers). Modifier is
  always `floor((score − 10) / 2)` — e.g. STR 9 = −1. Shown as `9 (-1)` everywhere.
- **Hide HP / Shared screen** — Healthy / Bloodied / Badly bloodied for a projector view.
  Leaving shared screen restores your previous Hide HP preference.
- **Day / Night theme** — same earthy botanical palette; night is a moonlit canopy.
- **Parchment stage** — the encounter column is an unfurled sheet: aged wash, fibre grain,
  and a scroll rod at each end. Ornament is stripped in shared-screen mode.
- **PF2e actions** — diamond cost glyphs on activities; click an ability on the combat
  row (or Use in the stat block) to spend from the turn pool. Action pip: click spend 1,
  Shift+click restore 3 / clear MAP.
- **Action damage** — set amount (`2d6+3` or flat) and type on Actions / Bonus actions.
  Paste import and bestiary fills this from Hit: lines when possible. Clicking the action
  chip rolls and applies to the multi-select (or the focused row if nothing is multi-selected).
- **Action requirements** — checkbox + note on Actions / Bonus actions / Reactions for
  special conditions (PF2e Requirements, “only while grappled”, etc.). Shown on the
  preview and as a `req` mark on combat chips.
- **Portraits** — upload a token/portrait on bestiary creatures, party sheets, and NPCs.
  Images are resized (~256px JPEG) and show in lists, combat rows, and the stat block preview.
- **Combat inspect** — click a name, **Stats**, portrait, or press `i` / Enter on the focused
  row to open that combatant’s stat block (or the party/NPC sheet if there isn’t one).
- **Spell catalog** — searchable 5e SRD (sync for the full list) and a PF2e Player Core
  subset, plus homebrew. Filter by cantrip / level / rank.
## Controls

| Key | Action |
|-----|--------|
| Space / → | Next turn |
| ← | Previous turn |
| j / k | Move keyboard focus (does not check boxes) |
| i / Enter | Open stats for focused combatant |
| D / H | Focus damage field (selection bar if anyone is checked) |
| S | Bulk save (with selection) |
| / | Focus bestiary search |
| Ctrl+K | Command palette |
| Ctrl+Z | Undo HP change (outside text fields) |
| ? | Cheat sheet |

Damage field: number or `2d6+3` + Enter = damage, **Heal** (or Shift+Enter, `h12`) = heal, `t12` = temp HP. Heal gets a green light on the row. Pick a damage type (or type `12 fire`) so resistance, immunity, and vulnerability apply. Check boxes for AoE; the bar at the bottom has Damage and Heal for everyone checked.

## Session workflow

- **First-run wizard** — name the campaign, seat the party (or paste DDB/Pathbuilder),
  optionally seed a Goblin ambush and run it with the party. Cancelling a forced “New
  campaign” rolls back the half-built campaign.
- **Session notes** — left roster **Notes** tab (this session / pinned / all, export
  markdown). Hover a log line and hit **+** to promote it into the current note.
- **Clear** — wipe the fight tape (no HP write-back). Warns if loot is still unawarded.
- **End fight** — write live HP/slots back to party & NPCs; clear encounter clocks; loot
  prompt if anything is still pending.
- **End session** — same write-back, increment `sessionNumber`, clear encounter trackers
  (notes are kept); same loot prompt when needed.
- **Export log** — markdown recap of damage, spends, and clock ticks.
- **Settings** — export / import the active campaign as portable JSON. Day / Night theme
  toggle.

Dev-only design freeze: open `#/dev/gallery` in the browser.

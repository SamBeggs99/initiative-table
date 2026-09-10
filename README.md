# Dungeon Master MultiTool

A D&D 5e combat manager and campaign multi-tool for DMs running games live at the table.
Pathfinder 2e is supported per-campaign through a system adapter (conditions, three-action
economy, dying/wounded, encounter XP budgets, perception-based initiative, degrees of
success on attack rolls).

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
2. SQL Editor: run [`supabase/schema.sql`](supabase/schema.sql) (`user_blobs` + row-level
   security + the `portraits` column). Safe to re-run on an existing project — the
   portrait column is an `add column if not exists`. Without it everything still
   works, portraits just stay on the device that made them.
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
| Portraits | IndexedDB blobs keyed by content hash, copied into the cloud row (base64) so they follow the account |
| Bestiary (synced + bundled SRD) | IndexedDB via Dexie — **Sync** on each device |
| Spells (synced 5e SRD + synced PF2e Player Core + bundled) | IndexedDB via Dexie (`initiative-table-spells`) — **Sync** on each device |
| Session log | `localStorage`, capped at 200 lines, per active campaign (export as markdown anytime). Not copied to the cloud — it is per-device narration |

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

## Durability

The app is built on the assumption that losing round 4 of a boss fight is a product
failure, so the save paths are explicit about what they guarantee.

- **Local first.** Every mutation writes to `localStorage` synchronously. The cloud copy
  is a backup and a cross-device convenience, never the source of truth.
- **A failed save is visible.** localStorage is a hard ~5 MB wall and `setItem` throws at
  it. Writes go through a guarded storage adapter that raises a persistent **Not saving**
  banner with an **Export campaign** button, and — importantly — does *not* rethrow, because
  Zustand's `persist` propagates a storage error straight out of `setState`, which would
  make every subsequent mutation throw. Full storage degrades to memory-only with a
  warning instead of breaking the fight.
- **The cloud never silently wins.** `src/lib/cloud/merge.ts` compares this device's
  unpushed-change marker against the cloud row's `updated_at` and returns push / pull /
  conflict / noop. A genuine fork — this device has unsaved work *and* the cloud moved
  since — shows a blocking dialog naming both timestamps and campaign counts. It has no
  dismiss path, because either branch discards a session's work and that is the DM's call.
- **Sync health is on screen.** A pill in the header reads Saved / Saving / Offline / Not
  saved, with the last successful save time in its tooltip; clicking it retries. A failing
  push used to be a `console.warn` and nothing else.
- **Crashes are recoverable.** An error boundary around the whole tree offers **Export
  campaign** and a reload rather than a white screen, and falls back to dumping the raw
  persisted blob if the store itself is too broken to export cleanly.
- **Immediate flush** at the moments that matter — tab hidden, network restored, and end
  fight / end session / clear encounter. Between those, pushes are debounced 3 s.

## Your account, any device

Campaigns, party sheets, NPCs, homebrew, and portraits belong to the account, not
to the browser. Signing in anywhere loads them; the SRD catalogs are the one
per-device download.

- **Sign-out saves, then clears the device.** It flushes a final push, waits for
  it to land, and only then removes the local copy. If the push fails the local
  copy is *kept* — losing a session to a sign-out is not an acceptable trade — and
  the dialog says so before you commit. Catalogs stay, so the next sign-in does
  not re-download the bestiary.
- **Offline with a session** works unchanged: the token is read from local
  storage, the app runs, and pushes queue until the network is back.
- **Offline without a session** offers *Work offline on this device*, but only
  when the auth server is genuinely unreachable *and* this device already holds
  campaigns. A deliberate sign-out clears the device, so a signed-out browser has
  nothing to offer and never shows it. The session then runs local-only behind a
  persistent banner, and because working offline sets the store's dirty marker,
  the next sign-in reaches `decideSync` with a dirty local copy — it can push or
  ask, never silently pull over the evening's work.
- **Login says which problem you have.** "Can't reach the server" instead of an
  unexplained form that cannot be completed.

## Portraits

Portraits are Dexie blobs keyed by a SHA-256 of their own bytes, referenced from
sheets by `portraitId`.

They used to be base64 `portraitDataUrl` strings on `PartyMember`, `NpcRecord`
and `StatBlock` — all of which live in campaign state, therefore in
`localStorage`. Base64 inflates by a third, browsers count `localStorage` in
UTF-16, and `Combatant.statBlock` is an embedded copy, so one 120 kB JPEG cost
roughly **320 kB of a ~5 MB budget, once per combatant carrying it**. A pack of
eight goblins from a single bestiary row meant eight copies of one picture. A
five-hero party plus ten portrait-bearing NPCs was most of the budget before
combat started.

- **Content-addressed**, so byte-identical images collapse to one row no matter
  how many sheets or combatants point at them.
- **Not embedded on the tape.** Combat rows resolve a portrait from the live
  sheet first, then the bestiary row — `resolveCombatantPortrait` returns a
  *reference*, and the component resolves the bytes.
- **Migrated automatically** on boot and after every cloud pull, so a campaign
  synced down from a device still on the old build is converted too. Idempotent,
  because re-importing the same bytes yields the same id.
- **Garbage-collected** when a sheet, NPC, or campaign is deleted — driven by the
  ids actually in use rather than by refcounts, and deferred a few seconds so it
  never runs in the same tick as the click.
- **Synced** as base64 under the blob's `portraits` key, cached behind the same
  change signal as homebrew so a fight pushing HP every few seconds does not
  re-upload the party's faces. Capped at 4 MB total; the per-image cap is
  unchanged at ~120 kB.

## Offline

The app is installable and runs with no network at all.

- `manifest.webmanifest` + a hand-rolled service worker (`scripts/sw-template.js`, emitted
  with a build-time precache manifest by the plugin in `vite.config.ts`) precache the shell:
  entry chunk, CSS, fonts, icons.
- Fonts are **self-hosted** in `public/fonts` — one variable WOFF2 per family per subset,
  ~145 KB for latin. No `fonts.googleapis.com` stylesheet, which was render-blocking and
  made a cold offline load impossible. Licences in [`FONT-NOTICE.txt`](FONT-NOTICE.txt).
- External catalogs (Supabase, Open5e, dnd5eapi, Nethys) are deliberately **never** cached
  — a stale catalog served from disk would make **Sync** a lie.
- Lazily-imported chunks (editors, the encounter library, the Nethys snapshots) are cached
  on first use, so going offline after opening them keeps them working.
- Updates are picked up on the next open, never by reloading the page under a DM mid-fight.

## Load budget

The entry chunk is what a DM waits on before round 1, so catalogs and modal-gated
components stay out of it:

| Chunk | Raw | Gzip |
|---|---|---|
| entry (`index-*.js`) | ~590 kB | ~162 kB |
| PF2e Player Core spells (dynamic, sync fallback only) | 1.4 MB | 222 kB |
| PF2e Monster Core (dynamic, sync fallback only) | 2.1 MB | 482 kB |
| editors / library / wizard / settings (lazy) | 6–36 kB each | 2–9 kB each |

Rules: catalog JSON is loaded with a dynamic `import()`; modal-gated components go through
`React.lazy` wrapped in `LazyOverlay`. `chunkSizeWarningLimit` is set to 700 kB so a stray
static import of a catalog shows up in the build output.

## Headline features

- **Left roster** — Players, NPCs, **Library** (creatures + spells), and Notes. In combat
  the roster collapses to a rail; `/` or **L** opens creatures to add enemies. On a phone
  the app shows one pane at a time with a **Roster / Combat / Log** bar along the bottom.
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
- **Attack rolls** — clicking an action chip rolls `d20 + attack bonus` against each
  selected target’s AC, marks hit / miss / crit, and applies damage only to the
  ones that landed. 5e crits double the dice and not the modifier; PF2e uses degrees of
  success (AC+10, nat 20 / nat 1 shift one step) and doubles the total. The `− = +`
  toggle in the header rolls those attacks with disadvantage, straight, or advantage.
  An action with no printed attack bonus (a save-based AoE) still applies to everyone
  selected, as before.
- **Action damage** — set amount (`2d6+3`, `1d8+2d8+4`, or flat) and type on Actions /
  Bonus actions. Paste import and bestiary fills this from Hit: lines when possible.
  Multi-clause damage (`2d6 slashing plus 1d6 fire`) rolls each clause on its own so
  resistance is read per part, while undo and the concentration DC stay per hit.
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

Damage field: number or a sum of dice (`2d6+3`, `1d8+2d8+4`, `10-1d4`) + Enter = damage, **Heal** (or Shift+Enter, `h12`) = heal, `t12` = temp HP. Heal gets a green light on the row. Pick a damage type (or type `12 fire`) so resistance, immunity, and vulnerability apply. Check boxes for AoE; the bar at the bottom has Damage and Heal for everyone checked.

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

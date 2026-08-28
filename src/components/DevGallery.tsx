/**
 * Design-system freeze page. Open via `#/dev/gallery` — not linked from the
 * product chrome so it never appears mid-session.
 */
import type { CSSProperties } from 'react';
import {
  BloomCluster,
  CornerVine,
  Sprig,
  SproutMark,
  VineRule,
} from './ornament/Botanical';

export function DevGallery({ onBack }: { onBack: () => void }) {
  return (
    <div className="min-h-full overflow-auto bg-surface p-6 text-text">
      <div className="mx-auto max-w-3xl space-y-8">
        <header className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold">Component gallery</h1>
            <p className="mt-1 text-sm text-muted">
              Freeze the visual language. If a restyle drifts from these samples,
              the restyle is wrong. Toggle Day / Night in the app header — the
              gallery inherits the live theme.
            </p>
          </div>
          <button type="button" className="btn" onClick={onBack}>
            ← Back to app
          </button>
        </header>

        <section className="space-y-3">
          <h2 className="section-title section-title-leaf">Botanical ornament</h2>
          <p className="text-xs text-muted">
            Decorative only. Ornament may never be the sole cue for state, and
            all of it disappears in shared-screen mode.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="card relative overflow-hidden p-4">
              <CornerVine size={78} />
              <div className="flex items-center gap-2">
                <SproutMark />
                <span className="text-sm font-semibold">Sprout + corner vine</span>
              </div>
              <p className="mt-1 text-xs text-muted">Panel headers, dialogs.</p>
            </div>
            <div className="card rail-vine rail-vine-left relative overflow-hidden p-4 pl-7">
              <div className="text-sm font-semibold">Rail vine</div>
              <p className="mt-1 text-xs text-muted">
                Climbs the outer edge of both rails.
              </p>
            </div>
            <div className="card flex items-center justify-center p-4">
              <BloomCluster size={124} />
            </div>
            <div className="card flex flex-col justify-center gap-2 p-4">
              <VineRule />
              <span className="text-center text-xs text-muted">Vine rule</span>
              <VineRule />
            </div>
            <div className="card panel-sprig p-4">
              <div className="flex items-center gap-2">
                <Sprig />
                <span className="text-sm font-semibold">Sprig + panel sprig</span>
              </div>
              <p className="mt-1 text-xs text-muted">
                Inline mark for empty states; the corner sprig sits in a panel
                header's padding gutter.
              </p>
            </div>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="section-title section-title-leaf">Buttons</h2>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn">
              Default
            </button>
            <button type="button" className="btn btn-primary">
              Primary
            </button>
            <button type="button" className="btn btn-accent">
              Accent
            </button>
            <button type="button" className="btn btn-danger">
              Danger
            </button>
            <button type="button" className="btn btn-ghost">
              Ghost
            </button>
            <button type="button" className="btn btn-sm">
              Small
            </button>
            <button type="button" className="btn" disabled>
              Disabled
            </button>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="section-title section-title-leaf">Fields & chips</h2>
          <div className="flex flex-wrap items-center gap-2">
            <input className="field" placeholder="field" defaultValue="14" />
            <span className="chip">chip</span>
            <span
              className="defense-chip defense-chip-resist"
              style={{ '--defense': '#e45a32' } as CSSProperties}
            >
              <span className="defense-chip-dot" />
              Fire
            </span>
            <span
              className="defense-chip defense-chip-immune"
              style={{ '--defense': '#5aaa5a' } as CSSProperties}
            >
              <span className="defense-chip-dot" />
              Poison
            </span>
            <span className="badge-soft">badge</span>
            <span className="badge-soft badge-accent">accent</span>
            <span className="badge-soft badge-condition">condition</span>
            <kbd className="chip font-mono-stats">Ctrl+K</kbd>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="section-title section-title-leaf">Cards & rails</h2>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="card p-3">
              <div className="section-title">card</div>
              <p className="mt-1 text-sm text-muted">Default panel surface.</p>
            </div>
            <div className="card card-hover p-3">
              <div className="section-title">card-hover</div>
              <p className="mt-1 text-sm text-muted">Interactive lift.</p>
            </div>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="section-title section-title-leaf">Combat row anatomy</h2>
          <div className="card overflow-hidden">
            <div className="row-combat row-active row-reveal px-3 py-2">
              <div className="flex items-center gap-2.5">
                <span className="init-pill init-pill-active">18</span>
                <span className="h-4 w-[3px] rounded-full bg-heal" />
                <span className="row-name w-36 text-sm font-semibold">Active PC</span>
                <span className="chip">AC 16</span>
                <span className="row-hp font-mono-stats text-sm">24/30</span>
              </div>
            </div>
            <div
              className="row-combat px-3 py-2"
              style={{ '--identity': '#3a54a2' } as CSSProperties}
            >
              <div className="flex items-center gap-2.5">
                <span className="init-pill init-pill-identity">14</span>
                <span className="h-4 w-[3px] rounded-full bg-heal" />
                <span className="row-name name-identity w-36 text-sm font-semibold">
                  Wizard (identity)
                </span>
                <span className="chip">AC 12</span>
              </div>
            </div>
            <div className="row-combat row-dead px-3 py-2">
              <div className="flex items-center gap-2.5">
                <span className="init-pill">7</span>
                <span className="h-4 w-[3px] rounded-full bg-damage" />
                <span className="row-name w-36 text-sm font-semibold line-through">
                  Dead monster
                </span>
              </div>
            </div>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="section-title section-title-leaf">Segmented control</h2>
          <div className="seg grid-cols-3 max-w-sm">
            <button type="button" className="seg-item bg-panel font-semibold">
              Players
            </button>
            <button type="button" className="seg-item">
              NPCs
            </button>
            <button type="button" className="seg-item">
              Bestiary
            </button>
          </div>
        </section>

        <p className="text-[11px] text-muted">
          Bookmark <code className="font-mono-stats">#/dev/gallery</code> while
          developing. Product UI never deep-links here.
        </p>
      </div>
    </div>
  );
}

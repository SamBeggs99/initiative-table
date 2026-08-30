import { hueHex, npcHueId, pcHueId } from '../../lib/identity';
import { adjustAbilityBonus } from '../../lib/statblock-derived';
import { selectActiveCampaign, useStore } from '../../store';
import type { StatBlockFormModel } from '../../systems';
import type { Combatant, Entry, NpcRecord, PartyMember } from '../../types';
import { PortraitThumb } from '../ui/Portrait';
import { StatBlockPreview } from '../statblock/StatBlockPreview';
import type { ActionCost } from '../../lib/pf2e-actions';
import type { CSSProperties } from 'react';

function LiveLine({ combatant }: { combatant: Combatant }) {
  const campaign = useStore(selectActiveCampaign);
  const combatStarted = useStore((s) => s.getActiveCombat().started);
  const showHero = combatant.kind === 'pc' && campaign?.system === 'pf2e';
  const conds = combatant.conditions
    .map((c) => (c.value != null ? `${c.name} ${c.value}` : c.name))
    .join(', ');
  const slots = Object.entries(combatant.spellSlots)
    .filter(([, s]) => s.max > 0)
    .map(([lvl, s]) => `L${lvl} ${s.used}/${s.max}`)
    .join(' · ');
  return (
    <dl className="mb-3 grid grid-cols-2 gap-x-3 gap-y-1 font-mono-stats text-xs tabular-nums">
      <div>
        <span className="text-muted">AC </span>
        <span className="text-text">{combatant.ac}</span>
      </div>
      <div>
        <span className="text-muted">HP </span>
        <span className="text-text">
          {combatant.hp}/{combatant.maxHp}
          {combatant.tempHp > 0 ? ` +${combatant.tempHp}` : ''}
        </span>
      </div>
      {combatStarted && (
        <div>
          <span className="text-muted">Init </span>
          <span className="text-text">{combatant.initiative ?? '—'}</span>
        </div>
      )}
      <div>
        <span className="text-muted">Dex </span>
        <span className="text-text">{combatant.dex}</span>
      </div>
      {slots && (
        <div className="col-span-2">
          <span className="text-muted">Slots </span>
          <span className="text-text">{slots}</span>
        </div>
      )}
      {combatant.focusPoints && (
        <div className="col-span-2">
          <span className="text-muted">Focus </span>
          <span className="text-text">
            {combatant.focusPoints.current}/{combatant.focusPoints.max}
          </span>
        </div>
      )}
      {showHero && (
        <div>
          <span className="text-muted">Hero </span>
          <span className="text-text">{combatant.heroPoints ?? 1}</span>
        </div>
      )}
      {conds && (
        <div className="col-span-2">
          <span className="text-muted">Conditions </span>
          <span className="text-text">{conds}</span>
        </div>
      )}
    </dl>
  );
}

function PartyCard({
  member,
  combatant,
}: {
  member: PartyMember;
  combatant: Combatant;
}) {
  return (
    <div
      className="stat-sheet p-3 text-sm"
      style={
        {
          '--identity': hueHex(pcHueId(member.class, member.name)),
        } as CSSProperties
      }
    >
      <header className="mb-2 flex items-start gap-3">
        <PortraitThumb src={member.portraitDataUrl} alt="" size="md" />
        <div className="min-w-0">
          <h3 className="sheet-title text-2xl leading-tight">{member.name}</h3>
          <p className="text-xs italic text-muted">
            Level {member.level} {member.class || 'adventurer'}
            {member.ancestry ? ` · ${member.ancestry}` : ''}
          </p>
          <p className="mt-0.5 text-[11px] text-accent">
            Player · {member.playerName || 'Not assigned'}
          </p>
        </div>
      </header>
      <LiveLine combatant={combatant} />
      <p className="text-xs text-muted">
        Passive Perception {member.passivePerception} · Investigation{' '}
        {member.passiveInvestigation}
      </p>
      {member.notes.trim() && (
        <p className="mt-2 whitespace-pre-wrap text-xs text-text">{member.notes}</p>
      )}
    </div>
  );
}

function NpcCard({ npc, combatant }: { npc: NpcRecord; combatant: Combatant }) {
  const bits = [npc.role, npc.faction, npc.location].filter(Boolean).join(' · ');
  return (
    <div
      className="stat-sheet p-3 text-sm"
      style={
        {
          '--identity': hueHex(npcHueId(npc.id || npc.name)),
        } as CSSProperties
      }
    >
      <header className="mb-2 flex items-start gap-3">
        <PortraitThumb
          src={npc.portraitDataUrl ?? npc.statBlock?.portraitDataUrl}
          alt=""
          size="md"
        />
        <div className="min-w-0">
          <h3 className="sheet-title text-2xl leading-tight">{npc.name}</h3>
          <p className="text-xs italic text-muted">
            {npc.kind === 'statted' ? 'Statted NPC' : 'Character NPC'}
            {bits ? ` · ${bits}` : ''}
          </p>
        </div>
      </header>
      <LiveLine combatant={combatant} />
      {npc.voice && (
        <p className="text-xs text-muted">
          <span className="font-semibold text-text">Voice. </span>
          {npc.voice}
        </p>
      )}
      {npc.wants && (
        <p className="mt-1 text-xs text-muted">
          <span className="font-semibold text-text">Wants. </span>
          {npc.wants}
        </p>
      )}
      {npc.secret && (
        <p className="mt-1 text-xs text-amber">
          <span className="font-semibold">Secret. </span>
          {npc.secret}
        </p>
      )}
      {npc.notes.trim() && (
        <p className="mt-2 whitespace-pre-wrap text-xs text-text">{npc.notes}</p>
      )}
    </div>
  );
}

export function CombatantInspect({
  combatant,
  form,
  liveActions,
}: {
  combatant: Combatant;
  form: StatBlockFormModel;
  liveActions?: {
    remaining: number;
    onUse: (entry: Entry, cost: ActionCost) => void;
  };
}) {
  const campaign = useStore(selectActiveCampaign);
  const updateCombatant = useStore((s) => s.updateCombatant);
  const party = combatant.sourcePartyMemberId
    ? campaign?.party.find((p) => p.id === combatant.sourcePartyMemberId)
    : undefined;
  const npc = combatant.sourceNpcId
    ? campaign?.npcs.find((n) => n.id === combatant.sourceNpcId)
    : undefined;

  if (combatant.statBlock) {
    return (
      <StatBlockPreview
        block={combatant.statBlock}
        form={form}
        liveActions={liveActions}
        onAbilityBonus={(ability, delta) => {
          const block = combatant.statBlock;
          if (!block) return;
          updateCombatant(combatant.id, {
            statBlock: {
              ...block,
              abilityBonuses: adjustAbilityBonus(
                block.abilityBonuses,
                ability,
                delta,
              ),
            },
          });
        }}
      />
    );
  }
  if (party) return <PartyCard member={party} combatant={combatant} />;
  if (npc) return <NpcCard npc={npc} combatant={combatant} />;

  return (
    <div className="stat-sheet p-3 text-sm">
      <h3 className="sheet-title text-2xl leading-tight">{combatant.name}</h3>
      <p className="mb-2 text-xs italic text-muted">
        {combatant.kind === 'pc'
          ? 'Player character'
          : combatant.kind === 'lair'
            ? 'Lair action'
            : 'Combatant'}
        {combatant.charClass ? ` · ${combatant.charClass}` : ''}
      </p>
      <LiveLine combatant={combatant} />
      {combatant.notes.trim() ? (
        <p className="whitespace-pre-wrap text-xs text-text">{combatant.notes}</p>
      ) : (
        <p className="text-xs text-muted">No embedded stat block for this combatant.</p>
      )}
    </div>
  );
}

/** Max edge length after resize (keeps localStorage / Dexie lean). */
export const PORTRAIT_MAX_PX = 256;

/** Soft cap for encoded size; we re-encode tighter if we exceed this. */
export const PORTRAIT_MAX_BYTES = 120_000;

const ALLOWED_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);

export type PortraitResult =
  | { ok: true; dataUrl: string; bytes: number }
  | { ok: false; error: string };

export function dataUrlByteLength(dataUrl: string): number {
  const i = dataUrl.indexOf(',');
  if (i < 0) return dataUrl.length;
  const b64 = dataUrl.slice(i + 1);
  // Base64 → bytes ≈ 3/4 of length (ignore padding noise)
  return Math.floor((b64.length * 3) / 4);
}

function loadImage(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not read that image.'));
    };
    img.src = url;
  });
}

function canvasToJpeg(
  canvas: HTMLCanvasElement,
  quality: number,
): Promise<string> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('Could not encode portrait.'));
          return;
        }
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('Could not encode portrait.'));
        reader.readAsDataURL(blob);
      },
      'image/jpeg',
      quality,
    );
  });
}

/**
 * Read a user-picked image file, downscale to a square-ish max edge, and
 * return a JPEG data URL suitable for embedding on PartyMember / StatBlock /
 * NpcRecord.
 */
export async function readPortraitFile(file: File): Promise<PortraitResult> {
  if (!file.type || !ALLOWED_TYPES.has(file.type)) {
    return {
      ok: false,
      error: 'Use a JPEG, PNG, WebP, or GIF image.',
    };
  }
  if (file.size > 8 * 1024 * 1024) {
    return { ok: false, error: 'Image is too large (max 8 MB before resize).' };
  }

  try {
    const img = await loadImage(file);
    const scale = Math.min(
      1,
      PORTRAIT_MAX_PX / Math.max(img.naturalWidth, img.naturalHeight, 1),
    );
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return { ok: false, error: 'Could not process image.' };
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);

    let quality = 0.82;
    let dataUrl = await canvasToJpeg(canvas, quality);
    let bytes = dataUrlByteLength(dataUrl);
    while (bytes > PORTRAIT_MAX_BYTES && quality > 0.45) {
      quality -= 0.12;
      dataUrl = await canvasToJpeg(canvas, quality);
      bytes = dataUrlByteLength(dataUrl);
    }
    if (bytes > PORTRAIT_MAX_BYTES * 1.4) {
      return {
        ok: false,
        error: 'Portrait is still too large after compression — try a simpler image.',
      };
    }
    return { ok: true, dataUrl, bytes };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Could not read that image.',
    };
  }
}

/** Resolve portrait for a combatant from party / NPC / embedded stat block. */
export function resolveCombatantPortrait(
  combatant: {
    sourcePartyMemberId?: string;
    sourceNpcId?: string;
    statBlock?: { portraitDataUrl?: string };
  },
  campaign: {
    party: { id: string; portraitDataUrl?: string }[];
    npcs: {
      id: string;
      portraitDataUrl?: string;
      statBlock?: { portraitDataUrl?: string };
    }[];
  } | null,
): string | undefined {
  if (combatant.sourcePartyMemberId && campaign) {
    const m = campaign.party.find((p) => p.id === combatant.sourcePartyMemberId);
    if (m?.portraitDataUrl) return m.portraitDataUrl;
  }
  if (combatant.sourceNpcId && campaign) {
    const n = campaign.npcs.find((npc) => npc.id === combatant.sourceNpcId);
    if (n?.portraitDataUrl) return n.portraitDataUrl;
    if (n?.statBlock?.portraitDataUrl) return n.statBlock.portraitDataUrl;
  }
  return combatant.statBlock?.portraitDataUrl;
}

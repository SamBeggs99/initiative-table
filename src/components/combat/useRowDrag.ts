import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';

/**
 * Pointer-driven row dragging for the turn order.
 *
 * Native HTML5 drag-and-drop was the obvious first answer and the wrong one: it
 * hands the browser a translucent snapshot, gives no way to move the other rows
 * while the pointer is down, and does not fire at all for a finger — so the
 * gesture read as a lurch between two states rather than as picking a row up.
 *
 * Here the carried row tracks the pointer exactly and its neighbours slide to
 * open the gap, which is the whole point: you can see where it will land before
 * you let go. Pointer events cover mouse, pen and touch from one code path.
 */

/** Half a row's height of slack before the order changes under your hand. */
const EDGE_SCROLL_ZONE = 56;
const EDGE_SCROLL_MAX = 18;

export interface RowDragState {
  /** Index being carried, or null when nothing is. */
  from: number | null;
  /** Index it would land on right now. */
  to: number | null;
  /** Pixels the carried row is offset from where it sits in the list. */
  dy: number;
  /** The carried row's height — the gap the others open. */
  height: number;
}

const IDLE: RowDragState = { from: null, to: null, dy: 0, height: 0 };

/**
 * Pointer position in the scroller's content space.
 *
 * Only differences of this are ever used, so the scroller's own offset on the
 * page cancels out — what matters is that scrolling while the pointer is still
 * counts as the row having moved.
 */
function contentY(clientY: number, scroller: HTMLElement | null): number {
  return clientY + (scroller?.scrollTop ?? 0);
}

interface Session {
  from: number;
  to: number;
  pointerId: number;
  /** Grab point in the scroller's content space. */
  startY: number;
  /**
   * Row centres in layout space, captured once at the grab.
   *
   * Read from `offsetTop`, not `getBoundingClientRect`, because the rows carry
   * a transform *and* a transition on it: for 180ms after a drop the previous
   * settle is still animating, and a bounding rect taken then reports where a
   * row is flying through rather than where it lives. Grabbing a second row
   * during that window used to open the gap in the wrong place. `offsetTop`
   * ignores transforms entirely, so the measurement is true the moment it is
   * taken.
   */
  centers: number[];
  height: number;
  scroller: HTMLElement | null;
  /** Last pointer position, so edge auto-scroll can re-resolve the target. */
  clientY: number;
  frame: number | null;
  el: HTMLElement;
}

export function useRowDrag(onMove: (from: number, to: number) => void) {
  const [drag, setDrag] = useState<RowDragState>(IDLE);
  const session = useRef<Session | null>(null);
  // Held in a ref so the pointer handlers never close over a stale store action.
  const onMoveRef = useRef(onMove);
  onMoveRef.current = onMove;

  const release = useCallback(() => {
    const s = session.current;
    session.current = null;
    if (s) {
      if (s.frame != null) cancelAnimationFrame(s.frame);
      try {
        s.el.releasePointerCapture(s.pointerId);
      } catch {
        // The pointer is already gone (cancelled, or the element unmounted).
      }
    }
    setDrag(IDLE);
    return s;
  }, []);

  /** Resolve where the carried row would land, and apply it to state. */
  const resolve = useCallback(() => {
    const s = session.current;
    if (!s) return;
    // Content space, so scrolling under the pointer counts as movement.
    const dy = contentY(s.clientY, s.scroller) - s.startY;
    const carried = s.centers[s.from]! + dy;

    // Nearest original centre. Because the captured centres never move, this
    // stays stable while the rows around it are sliding.
    let to = s.from;
    let best = Infinity;
    for (let i = 0; i < s.centers.length; i += 1) {
      const gap = Math.abs(s.centers[i]! - carried);
      if (gap < best) {
        best = gap;
        to = i;
      }
    }

    s.to = to;
    setDrag((d) =>
      d.dy === dy && d.to === to ? d : { from: s.from, to, dy, height: s.height },
    );
  }, []);

  /**
   * Keep scrolling while the pointer rests near an edge, so a twenty-row fight
   * can be reordered end to end without letting go.
   */
  const autoScroll = useCallback(() => {
    const s = session.current;
    if (!s || !s.scroller) return;
    const box = s.scroller.getBoundingClientRect();
    const above = s.clientY - box.top;
    const below = box.bottom - s.clientY;
    let step = 0;
    if (above < EDGE_SCROLL_ZONE) {
      step = -Math.ceil(((EDGE_SCROLL_ZONE - above) / EDGE_SCROLL_ZONE) * EDGE_SCROLL_MAX);
    } else if (below < EDGE_SCROLL_ZONE) {
      step = Math.ceil(((EDGE_SCROLL_ZONE - below) / EDGE_SCROLL_ZONE) * EDGE_SCROLL_MAX);
    }
    if (step !== 0) {
      const before = s.scroller.scrollTop;
      s.scroller.scrollTop += step;
      if (s.scroller.scrollTop !== before) resolve();
    }
    s.frame = requestAnimationFrame(autoScroll);
  }, [resolve]);

  const begin = useCallback(
    (
      e: { pointerId: number; clientY: number; currentTarget: EventTarget | null },
      index: number,
      rows: HTMLElement[],
      scroller: HTMLElement | null,
    ) => {
      const el = e.currentTarget as HTMLElement | null;
      const row = rows[index];
      if (!el || !row || rows.length < 2) return;

      session.current = {
        from: index,
        to: index,
        pointerId: e.pointerId,
        startY: contentY(e.clientY, scroller),
        centers: rows.map((r) => r.offsetTop + r.offsetHeight / 2),
        height: row.offsetHeight,
        scroller,
        clientY: e.clientY,
        frame: null,
        el,
      };
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        // Capture is a nicety; without it the window listeners below still work.
      }
      setDrag({ from: index, to: index, dy: 0, height: session.current.height });
      session.current.frame = requestAnimationFrame(autoScroll);
    },
    [autoScroll],
  );

  const move = useCallback(
    (e: { pointerId: number; clientY: number }) => {
      const s = session.current;
      if (!s || e.pointerId !== s.pointerId) return;
      s.clientY = e.clientY;
      resolve();
    },
    [resolve],
  );

  const drop = useCallback(
    (e: { pointerId: number }) => {
      const s = session.current;
      if (!s || e.pointerId !== s.pointerId) return;
      const { from, to } = s;
      release();
      if (to !== from) onMoveRef.current(from, to);
    },
    [release],
  );

  const cancel = useCallback(() => {
    release();
  }, [release]);

  // Escape abandons the drag with the order untouched — the same way out that
  // every other overlay in the app offers.
  useEffect(() => {
    if (drag.from == null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        release();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [drag.from, release]);

  // A drag must not outlive the component that started it.
  useEffect(() => () => void release(), [release]);

  /**
   * Where a row sits this frame. The carried row follows the pointer with no
   * transition; everything between it and its target slides by exactly one row
   * height, which is what opens the gap.
   */
  const rowStyle = useCallback(
    (index: number): CSSProperties => {
      const { from, to, dy, height } = drag;
      if (from == null || to == null) return {};
      if (index === from) return { transform: `translateY(${dy}px)` };
      if (from < to && index > from && index <= to) {
        return { transform: `translateY(${-height}px)` };
      }
      if (from > to && index >= to && index < from) {
        return { transform: `translateY(${height}px)` };
      }
      return {};
    },
    [drag],
  );

  return { drag, begin, move, drop, cancel, rowStyle };
}

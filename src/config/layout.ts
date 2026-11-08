/**
 * [UI-PLACEMENT] Where every piece of the HUD sits on screen.
 *
 * All numbers are design pixels on a 1920×1080 screen. The HUD scales with the window (see `uiScale`), so a
 * value of 40 here is 40px at 1080p, 20px at 540p, and so on. To move something, change it here. Search the
 * code for `[UI-PLACEMENT]` to find the component that reads each value.
 *
 * The layout follows Slay the Spire for now:
 *
 *   ┌─────────────────────────────────────────────────────────────┐
 *   │ HP · Grimoire          Room name                Turn · Menu │  topBar
 *   │                                                             │
 *   │                     ◇ isometric board ◇           ╭card╮    │  board / cardPreview (the hovered fragment)
 *   │                                                             │
 *   │            [ crafting table ............ ]  [CAST]          │  craftingTable + castButton (or CLEARED! / Climb out)
 *   │ (mana orb)                                       [Reroll]   │  manaOrb / reroll
 *   │ [Meditate]                                       [End turn] │  meditate / endTurn
 *   │ [Draw]           ╭card╮╭card╮╭card╮╭card╮╭card╮  [Discard]  │  drawPile / hand / discardPile
 *   └─────────────────────────────────────────────────────────────┘
 */
export const LAYOUT = {
  /** The screen the numbers below are designed for. */
  design: { width: 1920, height: 1080 },

  /** Top bar across the whole screen (HP, Grimoire, room name, turn, menu). */
  topBar: { height: 64 },

  /**
   * The free area the 3D board is fitted into: between the top bar and the crafting table, with side margins.
   * The camera zooms so the whole board fits inside this box (see scene/CameraRig.tsx).
   */
  board: { top: 74, bottom: 440, sideMargin: 260 },

  /** Hand of fragment cards, centred at the bottom. `fanDeg` is the tilt between neighbouring cards. */
  hand: { bottom: -24, cardWidth: 160, cardHeight: 224, spacing: 128, fanDeg: 4, arcDrop: 10, hoverLift: 70, hoverScale: 1.18, noteLift: 56 },

  /**
   * The "Hmmm..." note: the mage's memory of card combinations, a column on the left under the top bar and above
   * the mana orb (the board keeps `board.sideMargin` free on each side).
   */
  hmmm: { left: 18, top: 84, width: 236, bottom: 452 },

  /**
   * The crafting table: one big drop area centred above the hand. `offsetX` nudges it sideways from the screen
   * centre (negative = left). The strip along its top edge shows the spell name / hints.
   * Cards on it (`cardWidth`×`cardHeight`) stay wherever they are dropped, each with a random tilt of up to
   * `maxTiltDeg`. `overhang` is how much of a card (0–1) may stick out past the table's sides and bottom edge
   * (never over the strip at the top).
   * While the mage is stuck in quicksand, the "Climb out" button fills this same box instead.
   */
  craftingTable: { bottom: 220, width: 620, height: 222, offsetX: 0, stripHeight: 34, cardWidth: 92, cardHeight: 129, maxTiltDeg: 9, overhang: 0.25 },

  /** Cast button, to the right of the crafting table (it doesn't push the table off centre). */
  castButton: { gapFromTable: 28, width: 170, height: 104 },

  /** Mana orb (Slay the Spire's energy orb), bottom left above the Meditate button. */
  manaOrb: { left: 70, bottom: 300, size: 132 },

  /** Meditate button, under the mana orb. */
  meditate: { left: 52, bottom: 210, width: 168, height: 64 },

  /** CLEARED! panel with the Continue button: takes the crafting table's place once a room is cleared. */
  cleared: { bottom: 250, width: 560 },

  /** Draw pile, bottom-left corner. */
  drawPile: { left: 36, bottom: 30, size: 116 },

  /** Discard pile, bottom-right corner. */
  discardPile: { right: 36, bottom: 30, size: 116 },

  /** End turn button (with the action pips), above the discard pile. */
  endTurn: { right: 52, bottom: 172, width: 200, height: 84 },

  /** Reroll button, above End turn. */
  reroll: { right: 52, bottom: 276, width: 200, height: 64 },

  /** "Your turn" / "Enemy turn" banner and the enemy step caption. */
  banner: { top: 300, captionTop: 92 },

  /**
   * Picked-up items: shown big in the middle of the screen (`top` = the cards' centre line), then they fly into
   * the discard pile (or the hand, for fragments a Page Scrap stole).
   */
  pickup: { top: 400, cardWidth: 150, cardHeight: 210 },

  /**
   * The card of the fragment under the pointer (hud/CardPreview.tsx): big, in the empty space right of the board
   * (inside `board.sideMargin`), above the Reroll button. `width` sets its size; the height follows the card art.
   */
  cardPreview: { right: 16, top: 140, width: 236 },

  /** Loot and error toasts, under the top bar on the right. */
  toasts: { top: 84, right: 24, width: 380 },

  /** Combat log drawer, slides in from the right under the top bar. */
  logDrawer: { width: 440 },
} as const;

/** How much to scale design pixels for the current window: 1 at 1920×1080. */
export function uiScale(width: number, height: number): number {
  return Math.min(width / LAYOUT.design.width, height / LAYOUT.design.height);
}

const px = (n: number) => `calc(${n} * var(--u))`;

/**
 * [UI-PLACEMENT] The layout as CSS variables, set on the HUD root. hud.css uses these (e.g. `var(--hand-bottom)`),
 * so CSS never hard-codes a position. `--u` is one design pixel at the current window size.
 */
export function layoutCssVars(): Record<string, string> {
  const L = LAYOUT;
  return {
    '--topbar-h': px(L.topBar.height),
    '--hmmm-left': px(L.hmmm.left),
    '--hmmm-top': px(L.hmmm.top),
    '--hmmm-w': px(L.hmmm.width),
    '--hmmm-bottom': px(L.hmmm.bottom),
    '--hand-bottom': px(L.hand.bottom),
    '--card-w': px(L.hand.cardWidth),
    '--card-h': px(L.hand.cardHeight),
    '--table-bottom': px(L.craftingTable.bottom),
    '--table-w': px(L.craftingTable.width),
    '--table-h': px(L.craftingTable.height),
    '--table-offset-x': px(L.craftingTable.offsetX),
    '--table-strip-h': px(L.craftingTable.stripHeight),
    '--table-card-w': px(L.craftingTable.cardWidth),
    '--table-card-h': px(L.craftingTable.cardHeight),
    '--cast-gap': px(L.castButton.gapFromTable),
    '--cast-w': px(L.castButton.width),
    '--cast-h': px(L.castButton.height),
    '--orb-left': px(L.manaOrb.left),
    '--orb-bottom': px(L.manaOrb.bottom),
    '--orb-size': px(L.manaOrb.size),
    '--meditate-left': px(L.meditate.left),
    '--meditate-bottom': px(L.meditate.bottom),
    '--meditate-w': px(L.meditate.width),
    '--meditate-h': px(L.meditate.height),
    '--cleared-bottom': px(L.cleared.bottom),
    '--cleared-w': px(L.cleared.width),
    '--draw-left': px(L.drawPile.left),
    '--draw-bottom': px(L.drawPile.bottom),
    '--draw-size': px(L.drawPile.size),
    '--discard-right': px(L.discardPile.right),
    '--discard-bottom': px(L.discardPile.bottom),
    '--discard-size': px(L.discardPile.size),
    '--endturn-right': px(L.endTurn.right),
    '--endturn-bottom': px(L.endTurn.bottom),
    '--endturn-w': px(L.endTurn.width),
    '--endturn-h': px(L.endTurn.height),
    '--reroll-right': px(L.reroll.right),
    '--reroll-bottom': px(L.reroll.bottom),
    '--reroll-w': px(L.reroll.width),
    '--reroll-h': px(L.reroll.height),
    '--banner-top': px(L.banner.top),
    '--caption-top': px(L.banner.captionTop),
    '--pickup-top': px(L.pickup.top),
    '--pickup-card-w': px(L.pickup.cardWidth),
    '--pickup-card-h': px(L.pickup.cardHeight),
    '--preview-right': px(L.cardPreview.right),
    '--preview-top': px(L.cardPreview.top),
    '--preview-w': px(L.cardPreview.width),
    '--toasts-top': px(L.toasts.top),
    '--toasts-right': px(L.toasts.right),
    '--toasts-w': px(L.toasts.width),
    '--log-w': px(L.logDrawer.width),
  };
}

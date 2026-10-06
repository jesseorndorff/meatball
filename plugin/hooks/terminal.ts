import type { Motion } from '../types'

/**
 * The meatball in a terminal: one line of colored text, a little face that
 * rolls along the band and changes with his mood. Pixel art there is too big
 * and, where block characters don't fill the line, sliced into stripes.
 */

/** How fast he rolls in a terminal, in columns a second. */
const SPEED = 12
/** The room his face, its extras and a trail of helpers take, so the far end of the bar fits him. */
export const WIDTH = 16

const MEAT = '#c0603a'
const GOLD = '#e0b040'
const BLUE = '#6aa8f0'
const RED = '#e05a5a'
const DUST = '#806050'
const GREEN = '#6ac46a'

/** A run of text in one color. */
export type Piece = { text: string; color: string }

/** His cheeks as the context fills: rounder and rounder. */
function wrap(face: string, fill: Motion['fill']) {
  if (fill === 'stuffed') return `((${face}))`
  if (fill === 'full') return `( ${face} )`
  return `(${face})`
}

/** Two frames of anything, swapping every `ms`. */
function beat(t: number, ms: number) {
  return Math.floor(t / ms) % 2 === 0
}

/**
 * His face and extras for this moment, most urgent first, as the desktop
 * picks its poses, with a little `o` behind him for each running subagent.
 * `t` is milliseconds, for the blinks and flaps.
 */
export function face(m: Motion, isRolling: boolean, isReturning: boolean, t: number, helpers = 0): Piece[] {
  const pieces = alone(m, isRolling, isReturning, t)
  if (helpers <= 0) return pieces
  const trail = { text: 'o'.repeat(helpers), color: MEAT }
  return isReturning ? [...pieces, { text: ' ', color: MEAT }, trail] : [trail, { text: ' ', color: MEAT }, ...pieces]
}

function alone(m: Motion, isRolling: boolean, isReturning: boolean, t: number): Piece[] {
  const body = (eyes: string) => ({ text: wrap(eyes, m.fill), color: MEAT })
  const spinner = '⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏'
  const spin = { text: ` ${spinner[Math.floor(t / 100) % spinner.length]}`, color: GOLD }
  if (m.mood === 'alert') return [body('O_O'), { text: beat(t, 250) ? '!' : ' ', color: GOLD }]
  if (m.pose === 'hurt') return [body(beat(t, 200) ? 'x_x' : '+_+'), { text: '#', color: RED }]
  if (m.pose === 'fail') return [body(beat(t, 200) ? '>_<' : '>.<'), { text: ' ✗', color: RED }]
  if (m.pose === 'pass') return [{ text: '\\', color: MEAT }, body('^o^'), { text: '/', color: MEAT }, { text: ' ✓', color: GREEN }]
  if (m.pose === 'celebrate') return [body('^ᴗ^'), { text: beat(t, 300) ? ' ⚑ *' : ' ⚑· ', color: GOLD }]
  if (m.pose === 'chomp') return [body(beat(t, 180) ? '•O•' : '•-•'), { text: beat(t, 180) ? '·' : ':', color: GOLD }]
  if (m.pose === 'bounce') return [{ text: '\\', color: MEAT }, body('^ᴗ^'), { text: '/', color: MEAT }]
  if (m.mood === 'testing') return [body('°_°'), spin]
  if (m.mood === 'deliver') return [body('•ᴗ•'), { text: beat(t, 300) ? ' ✉' : ' ✉ ', color: GOLD }]
  if (m.mood === 'busy') return [body('¬_¬'), spin]
  if (m.mood === 'sleep') return [body('-_-'), { text: Math.floor(t / 1400) % 2 ? ' zZ' : ' z', color: BLUE }]
  if (isRolling) {
    const dust = { text: beat(t, 150) ? '∙' : '·', color: DUST }
    return isReturning ? [body('•ᴗ•'), dust] : [dust, body('•ᴗ•')]
  }
  return [body('•ᴗ•')]
}

/** Whether anything about him moves right now, so the band needs repainting. */
export function isMoving(m: Motion, isRolling: boolean) {
  return isRolling || m.pose !== 'none' || m.mood !== 'none'
}

/** One trip out and back along a bar this many columns wide, in milliseconds. */
export function lapMs(columns: number) {
  return Math.max(1, Math.round(((columns - WIDTH) * 2 * 1000) / SPEED))
}

/** How far along a bar he is, 0 to 1, after rolling `rolledMs` from the middle on a lap this long. */
export function alongAt(rolledMs: number, lap: number) {
  const p = ((rolledMs + lap / 4) % lap) / lap
  return { along: p < 0.5 ? p * 2 : 2 - p * 2, isReturning: p >= 0.5 }
}

/**
 * His way home to the middle from `from` (0 to 1 along a bar `span` units
 * long) at `speed` units a second, `elapsedMs` after he set off: where he is,
 * how long is left, and whether he heads left.
 */
export function homeward(from: number, span: number, speed: number, elapsedMs: number) {
  const ms = (Math.abs(0.5 - from) * span * 1000) / speed
  const t = ms === 0 ? 1 : Math.min(1, Math.max(0, elapsedMs / ms))
  return { along: from + (0.5 - from) * t, leftMs: ms - Math.max(0, Math.min(ms, elapsedMs)), isLeft: from > 0.5 }
}

/** Which column he starts at, and whether he is heading back to the left. */
export function place(rolledMs: number, columns: number) {
  const { along, isReturning } = alongAt(rolledMs, lapMs(columns))
  return { column: Math.round(along * Math.max(0, columns - WIDTH)), isReturning }
}

/** Where he is on his way home after a turn, `sinceHome` ms after he set off (negative while he hops). */
export function placeHome(from: number, columns: number, sinceHome: number) {
  const span = Math.max(0, columns - WIDTH)
  const walk = homeward(alongAt(from, lapMs(columns)).along, span, SPEED, sinceHome)
  return { column: Math.round(walk.along * span), isReturning: walk.isLeft, isWalking: sinceHome >= 0 && walk.leftMs > 0 }
}

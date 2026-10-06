import type { Motion } from '../types'

/**
 * The meatball in a terminal: one line of colored text, a little face that
 * rolls along the band and changes with his mood. Pixel art there is too big
 * and, where block characters don't fill the line, sliced into stripes.
 */

/** How fast he rolls in a terminal, in columns a second. */
const SPEED = 12
/** The room his face and its extras take, so the far end of the bar fits him. */
export const WIDTH = 11

const MEAT = '#c0603a'
const GOLD = '#e0b040'
const BLUE = '#6aa8f0'
const RED = '#e05a5a'
const DUST = '#806050'

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
 * picks its poses. `t` is milliseconds, for the blinks and flaps.
 */
export function face(m: Motion, isRolling: boolean, isReturning: boolean, t: number): Piece[] {
  const body = (eyes: string) => ({ text: wrap(eyes, m.fill), color: MEAT })
  if (m.mood === 'alert') return [body('O_O'), { text: beat(t, 250) ? '!' : ' ', color: GOLD }]
  if (m.pose === 'hurt') return [body(beat(t, 200) ? 'x_x' : '+_+'), { text: '#', color: RED }]
  if (m.pose === 'chomp') return [body(beat(t, 180) ? '•O•' : '•-•'), { text: beat(t, 180) ? '·' : ':', color: GOLD }]
  if (m.pose === 'bounce') return [{ text: '\\', color: MEAT }, body('^ᴗ^'), { text: '/', color: MEAT }]
  if (m.mood === 'busy') {
    const spinner = '⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏'
    return [body('¬_¬'), { text: ` ${spinner[Math.floor(t / 100) % spinner.length]}`, color: GOLD }]
  }
  if (m.mood === 'sleep') return [body('-_-'), { text: Math.floor(t / 1400) % 2 ? ' zZ' : ' z', color: BLUE }]
  if (isRolling) {
    const dust = { text: beat(t, 150) ? '∙' : '·', color: DUST }
    return isReturning ? [body('•ᴗ•'), dust] : [dust, body('•ᴗ•')]
  }
  return [body('•ᴗ•')]
}

/** Whether anything about him moves right now, so the band needs repainting. */
export function isMoving(m: Motion, isRolling: boolean) {
  return isRolling || m.pose !== 'none' || m.mood === 'alert' || m.mood === 'busy' || m.mood === 'sleep'
}

/** One trip out and back along a bar this many columns wide, in milliseconds. */
export function lapMs(columns: number) {
  return Math.max(1, Math.round(((columns - WIDTH) * 2 * 1000) / SPEED))
}

/** Which column he starts at, and whether he is heading back to the left. */
export function place(rolledMs: number, columns: number) {
  const lap = lapMs(columns)
  const p = (rolledMs % lap) / lap
  const along = p < 0.5 ? p * 2 : 2 - p * 2
  return { column: Math.round(along * Math.max(0, columns - WIDTH)), isReturning: p >= 0.5 }
}

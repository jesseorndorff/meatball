import type { Motion } from '../types'
import { SPRITE16, type SpriteNode } from './sprite16'

/**
 * The meatball in a terminal: the 16x16 sprite painted in half-block cells,
 * two pixels to a cell (▀ with the upper pixel as foreground, the lower as
 * background), so he takes 16 columns and 8 rows.
 */

export const ROWS = 8
const SIZE = 16
/** How fast he rolls in a terminal, in columns a second. */
const SPEED = 12
/** The terminal's own color, for a cell or half-cell he leaves empty. */
const DEFAULT = 0x01000000
const UPPER = 0x2580 // ▀
const LOWER = 0x2584 // ▄
const SPACE = 0x20

const MOODS = ['alert', 'hurt', 'sleep', 'busy']
const SPIN_ORIGIN: Record<string, [number, number]> = {
  normal: [7.5, 8.5],
  full: [7.5, 7.5],
  stuffed: [7.5, 7.5],
}

/** What the sprite shows: the same poses the desktop's SVG switches on. */
export type Look = {
  fill: Motion['fill']
  mood?: 'alert' | 'hurt' | 'sleep' | 'busy'
  mouth: 'closed' | 'open' | 'chomp'
  roll: boolean
  idle: boolean
}

/** The pose for this moment, most urgent first, as the desktop picks it. */
export function lookOf(m: Motion, isRolling: boolean): Look {
  const base: Look = { fill: m.fill, mouth: 'closed', roll: false, idle: true }
  if (m.mood === 'alert') return { ...base, mood: 'alert' }
  if (m.pose === 'hurt') return { ...base, mood: 'hurt' }
  if (m.pose === 'chomp') return { ...base, mouth: 'chomp', idle: false }
  if (m.pose === 'bounce') return { ...base, mouth: 'open' }
  if (m.mood === 'busy') return { ...base, mood: 'busy' }
  if (m.mood === 'sleep') return { ...base, mood: 'sleep' }
  return isRolling ? { ...base, roll: true, idle: false } : base
}

function phase(t: number, period: number, delay = 0) {
  return ((((t - delay) % period) + period) % period) / period
}

/** Whether a group with these classes shows at time t (seconds), per the sprite's CSS. */
function shown(classes: string[], look: Look, t: number) {
  for (const c of classes) {
    if (c.startsWith('v-') && c !== `v-${look.fill}`) return false
    if (c === 'feet' && look.roll) return false
    if ((c === 'f-default' || c === 'mc-default') && look.mood) return false
    for (const prefix of ['f-', 'mc-', 'x-']) {
      const mood = c.slice(prefix.length)
      if (c.startsWith(prefix) && MOODS.includes(mood) && mood !== look.mood) return false
    }
    if (c === 'm-open') {
      if (look.mouth === 'chomp') return phase(t, 0.36) < 0.5
      if (look.mouth !== 'open') return false
    }
    if (c === 'm-closed') {
      if (look.mouth === 'chomp') return phase(t, 0.36) >= 0.5
      if (look.mouth === 'open') return false
    }
    if (c === 'x-alert' && phase(t, 0.5) >= 0.5) return false
    if (c === 'x-hurt' && phase(t, 0.4) >= 0.5) return false
    if (c === 'z1' && phase(t, 2.8) < 0.25) return false
  }
  return true
}

/** The .bob group's offset: the idle bob, the alert hop, the hurt shake. */
function bob(look: Look, t: number): [number, number] {
  if (look.roll) return [0, 0]
  if (look.mood === 'alert') {
    const p = phase(t, 1.4)
    return [0, (p >= 0.08 && p < 0.16) || (p >= 0.24 && p < 0.32) ? -1 : 0]
  }
  if (look.mood === 'hurt') {
    const p = phase(t, 1)
    return [(p >= 0.06 && p < 0.12) || (p >= 0.18 && p < 0.24) ? -1 : p >= 0.12 && p < 0.18 ? 1 : 0, 0]
  }
  if (look.mood === 'sleep') return [0, phase(t, 2.8) >= 0.5 ? -1 : 0]
  if (look.idle) return [0, phase(t, 1.2) >= 0.5 ? -1 : 0]
  return [0, 0]
}

/** The sprite at time t (seconds): 16x16 colors, -1 where he is see-through. */
export function paint(look: Look, t: number) {
  const grid = new Int32Array(SIZE * SIZE).fill(-1)
  const turn = look.roll ? Math.floor(phase(t, 0.6) * 4) : 0
  const cos = [1, 0, -1, 0][turn]
  const sin = [0, 1, 0, -1][turn]
  const [ox, oy] = SPIN_ORIGIN[look.fill]

  const walk = (n: SpriteNode, dx: number, dy: number, spun: boolean) => {
    if (n.c && !shown(n.c, look, t)) return
    if (n.c?.includes('bob')) {
      const [bx, by] = bob(look, t)
      dx += bx
      dy += by
    }
    spun = spun || Boolean(n.c?.includes('spin'))
    const r = n.r ?? []
    for (let i = 0; i < r.length; i += 5) {
      for (let x = r[i]; x < r[i] + r[i + 2]; x++) {
        for (let y = r[i + 1]; y < r[i + 1] + r[i + 3]; y++) {
          let px = x
          let py = y
          if (spun && turn) {
            const cx = x + 0.5 - ox
            const cy = y + 0.5 - oy
            px = Math.round(ox + cx * cos - cy * sin - 0.5)
            py = Math.round(oy + cx * sin + cy * cos - 0.5)
          }
          px += dx
          py += dy
          if (px >= 0 && px < SIZE && py >= 0 && py < SIZE) grid[py * SIZE + px] = r[i + 4]
        }
      }
    }
    for (const k of n.k ?? []) walk(k, dx, dy, spun)
  }
  walk(SPRITE16, 0, 0, false)
  return grid
}

/** One trip out and back along a bar this many columns wide, in milliseconds. */
export function lapMs(columns: number) {
  return Math.max(1, Math.round(((columns - SIZE) * 2 * 1000) / SPEED))
}

/** Which column his left edge is at, and whether he faces back to the left. */
export function place(rolledMs: number, columns: number) {
  const lap = lapMs(columns)
  const p = (rolledMs % lap) / lap
  const along = p < 0.5 ? p * 2 : 2 - p * 2
  return { column: Math.round(along * Math.max(0, columns - SIZE)), isReturning: p >= 0.5 }
}

/**
 * The band as Raster cells: `columns` x 8, base64 of [codePoint, fg, bg] u32
 * triplets, the sprite at `column`, mirrored when he heads back left.
 */
export function cells(grid: Int32Array, columns: number, column: number, isReturning: boolean) {
  const words = new Uint32Array(columns * ROWS * 3)
  for (let i = 0; i < columns * ROWS; i++) {
    words.set([SPACE, DEFAULT, DEFAULT], i * 3)
  }
  for (let sx = 0; sx < SIZE; sx++) {
    const col = column + (isReturning ? SIZE - 1 - sx : sx)
    if (col < 0 || col >= columns) continue
    for (let row = 0; row < ROWS; row++) {
      const top = grid[row * 2 * SIZE + sx]
      const bottom = grid[(row * 2 + 1) * SIZE + sx]
      const at = (row * columns + col) * 3
      if (top >= 0 && bottom >= 0) words.set([UPPER, top, bottom], at)
      else if (top >= 0) words.set([UPPER, top, DEFAULT], at)
      else if (bottom >= 0) words.set([LOWER, bottom, DEFAULT], at)
    }
  }
  return new Uint8Array(words.buffer).toBase64()
}

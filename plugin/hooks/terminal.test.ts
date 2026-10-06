import { expect, test } from 'claude-code/testing'

import { FRESH } from './register'
import { ROWS, cells, lookOf, paint, place } from './terminal'

const decode = (b64: string) => new Uint32Array(Uint8Array.fromBase64(b64).buffer)

test('the small sprite paints a meatball, feet and all', () => {
  const grid = paint(lookOf(FRESH, false), 0)
  const lit = grid.filter(c => c >= 0).length
  expect(lit).toBeGreaterThan(80)
  expect(lit).toBeLessThan(256)
})

test('rolling tucks his feet away and turns him', () => {
  const standing = paint(lookOf(FRESH, false), 0)
  const rolled = paint(lookOf(FRESH, true), 0.2)
  expect(Array.from(rolled)).not.toEqual(Array.from(standing))
})

test('moods change the picture', () => {
  const plain = Array.from(paint(lookOf(FRESH, false), 0))
  for (const mood of ['alert', 'busy', 'sleep'] as const) {
    expect(Array.from(paint(lookOf({ ...FRESH, mood }, false), 0))).not.toEqual(plain)
  }
  expect(Array.from(paint(lookOf({ ...FRESH, pose: 'hurt' }, false), 0))).not.toEqual(plain)
})

test('he packs into half-block cells, 8 rows tall, where he stands', () => {
  const grid = paint(lookOf(FRESH, false), 0)
  const words = decode(cells(grid, 40, 10, false))
  expect(words.length).toBe(40 * ROWS * 3)
  const glyphAt = (row: number, col: number) => words[(row * 40 + col) * 3]
  expect(glyphAt(4, 0)).toBe(0x20)
  const used = new Set<number>()
  for (let row = 0; row < ROWS; row++) for (let col = 10; col < 26; col++) used.add(glyphAt(row, col))
  expect(used.has(0x2580)).toBe(true)
})

test('he rolls end to end across the band and turns back', () => {
  expect(place(0, 80)).toEqual({ column: 0, isReturning: false })
  const lap = ((80 - 16) * 2 * 1000) / 12
  expect(place(lap / 2, 80).column).toBe(64)
  expect(place(lap * 0.75, 80)).toEqual({ column: 32, isReturning: true })
})

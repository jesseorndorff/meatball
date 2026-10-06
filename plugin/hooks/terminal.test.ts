import { expect, test } from 'claude-code/testing'

import { FRESH } from './register'
import { WIDTH, face, isMoving, place } from './terminal'

const say = (pieces: { text: string }[]) => pieces.map(p => p.text).join('')

test('he is one short line of text', () => {
  for (const pose of ['none', 'chomp', 'bounce', 'hurt'] as const) {
    for (const mood of ['none', 'alert', 'busy', 'sleep'] as const) {
      expect(say(face({ ...FRESH, pose, mood, fill: 'stuffed' }, true, false, 0)).length).toBeLessThanOrEqual(WIDTH)
    }
  }
})

test('each mood has its own face', () => {
  expect(say(face({ ...FRESH, mood: 'alert' }, false, false, 0))).toBe('(O_O)!')
  expect(say(face({ ...FRESH, pose: 'hurt' }, false, false, 0))).toContain('x_x')
  expect(say(face({ ...FRESH, mood: 'sleep' }, false, false, 0))).toContain('z')
  expect(say(face({ ...FRESH, mood: 'busy' }, false, false, 0))).toContain('¬_¬')
  expect(say(face({ ...FRESH, pose: 'bounce' }, false, false, 0))).toBe('\\(^ᴗ^)/')
})

test('he gets rounder as the context fills', () => {
  expect(say(face(FRESH, false, false, 0))).toBe('(•ᴗ•)')
  expect(say(face({ ...FRESH, fill: 'full' }, false, false, 0))).toBe('( •ᴗ• )')
  expect(say(face({ ...FRESH, fill: 'stuffed' }, false, false, 0))).toBe('((•ᴗ•))')
})

test('rolling kicks up dust behind him', () => {
  expect(say(face(FRESH, true, false, 0)).startsWith('∙')).toBe(true)
  expect(say(face(FRESH, true, true, 0)).endsWith('∙')).toBe(true)
})

test('he only asks for repaints while something moves', () => {
  expect(isMoving(FRESH, false)).toBe(false)
  expect(isMoving(FRESH, true)).toBe(true)
  expect(isMoving({ ...FRESH, mood: 'alert' }, false)).toBe(true)
})

test('he rolls end to end across the band and turns back', () => {
  expect(place(0, 80)).toEqual({ column: 0, isReturning: false })
  const lap = ((80 - WIDTH) * 2 * 1000) / 12
  expect(place(lap / 2, 80).column).toBe(80 - WIDTH)
  expect(place(lap * 0.75, 80).isReturning).toBe(true)
})

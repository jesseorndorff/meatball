import { expect, test } from 'claude-code/testing'

import type { Motion } from '../types'
import { FRESH, activityOf, agentCount, barWidth, fillFor, halt, lapMs, look, position, roll, settle, spot, stage } from './register'

const STILL: Motion = FRESH

test('he keeps his place along the bar across stops', () => {
  const rolling = roll(STILL, 1_000)
  const stopped = halt(rolling, 3_500)
  expect(position(stopped, 9_000)).toBe(2_500)
  expect(position(roll(stopped, 10_000), 11_000)).toBe(3_500)
})

test('rolling picks up where he left off', () => {
  const svg = stage({ ...STILL, rolledMs: 1_500, since: 0 }, 1_000, true, 1_000)
  expect(svg).toContain('data-roll=""')
  expect(svg).toContain('begin="-2.5s"')
  expect(svg).toContain('animation-play-state:running')
  expect(svg).toContain('viewBox="0 0 1000 48"')
})

test('a chomp stops him in place with his mouth going', () => {
  const svg = stage({ ...STILL, pose: 'chomp', rolledMs: 2_000 }, 5_000, true, 1_000)
  expect(svg).toContain('data-chomp=""')
  expect(svg).toContain('animation-play-state:paused')
  expect(svg).not.toContain('<animate')
})

test('the end of a turn is a happy hop', () => {
  const svg = stage({ ...STILL, pose: 'bounce' }, 0, false, 1_045)
  expect(svg).toContain('data-mouth="open"')
  expect(svg).toContain('@keyframes mb-hop')
  expect(svg.length).toBeLessThan(131072)
})

test('waiting, he bobs where he stopped', () => {
  const svg = stage({ ...STILL, rolledMs: 4_000 }, 0, false, 1_000)
  expect(svg).toContain('data-idle=""')
  expect(svg).not.toContain('@keyframes mb-hop')
})

test('he spans the whole bar at a steady pace', () => {
  const lap = lapMs(1_000)
  expect(lap).toBe(Math.round((952 * 2 * 1000) / 120))
  expect(spot(STILL, 0, lap).along).toBe(0)
  expect(spot({ ...STILL, rolledMs: lap / 2 }, 0, lap).along).toBe(1)
  expect(stage({ ...STILL, rolledMs: lap / 2 }, 0, false, 1_000)).toContain('translate(952.0 0)')
})

test('the bar follows the band, unless pinned', () => {
  expect(barWidth(null, 95)).toBe(1_045)
  expect(barWidth(1_400, 95)).toBe(1_400)
})

test('he gets rounder as the context fills', () => {
  expect(fillFor(20)).toBe('normal')
  expect(fillFor(60)).toBe('full')
  expect(fillFor(85)).toBe('stuffed')
  expect(stage({ ...STILL, fill: 'stuffed' }, 0, false, 1_000)).toContain('data-fill="stuffed"')
})

test('waiting on you beats everything, and stops him rolling', () => {
  const m: Motion = { ...STILL, mood: 'alert', pose: 'chomp', since: 0 }
  expect(look(m, false)).toBe('data-mood="alert" data-idle=""')
  expect(stage(m, 1_000, true, 1_000)).toContain('animation-play-state:paused')
})

test('a failure, a command, and a quiet spell each have a face', () => {
  expect(look({ ...STILL, pose: 'hurt', mood: 'busy' }, false)).toContain('data-mood="hurt"')
  expect(look({ ...STILL, mood: 'busy' }, false)).toContain('data-mood="busy"')
  expect(look({ ...STILL, mood: 'sleep' }, false)).toContain('data-mood="sleep"')
})

test('an older saved meatball picks up the new fields', () => {
  expect(settle({ rolledMs: 500 } as Partial<Motion>)).toEqual({ ...FRESH, rolledMs: 500 })
})

test('he knows a test run and a pull request when he sees one', () => {
  for (const cmd of ['npm test', 'pnpm run test -- --watch=false', 'npx jest src', 'pytest -q', 'go test ./...', 'cd plugin && claude plugin test .']) {
    expect(activityOf(cmd)).toBe('testing')
  }
  expect(activityOf('gh pr create --fill')).toBe('deliver')
  for (const cmd of ['ls -la', 'git status', 'cat latest-test.log', 'echo contest']) {
    expect(activityOf(cmd)).toBe('busy')
  }
})

test('he counts the subagents seen lately, up to four', () => {
  expect(agentCount({ a: 1_000, b: 2_000 }, 5_000)).toBe(2)
  expect(agentCount({ a: 1_000, b: 30_000 }, 30_000)).toBe(1)
  expect(agentCount({ a: 0, b: 0, c: 0, d: 0, e: 0 }, 1)).toBe(4)
})

test('each new activity has its look', () => {
  expect(look({ ...STILL, mood: 'testing' }, false)).toBe('data-mood="testing" data-idle=""')
  expect(look({ ...STILL, mood: 'deliver' }, false)).toBe('data-mood="deliver" data-idle=""')
  expect(look({ ...STILL, pose: 'pass' }, false)).toBe('data-mood="pass" data-idle=""')
  expect(look({ ...STILL, pose: 'fail', mood: 'testing' }, false)).toBe('data-mood="fail" data-idle=""')
  expect(look({ ...STILL, pose: 'celebrate' }, false)).toBe('data-mood="celebrate" data-idle=""')
})

test('running agents roll behind him as a strip of minis', () => {
  const svg = stage({ ...STILL, since: 0 }, 1_000, true, 1_000, 3)
  expect(svg).toContain('data-agents="3"')
  expect(svg).toContain('@keyframes mb-trail')
  expect(stage(STILL, 0, false, 1_000, 0)).not.toContain('data-agents')
  expect(svg.length).toBeLessThan(131_072)
})

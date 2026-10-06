import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, SvgProps } from 'claude-code'

import type { Agents, Fill, Mood, Motion, Pose } from '../types'
import { AGENTS, MEATBALL } from './meatball'
import * as terminal from './terminal'

const isHidden = atom({ plugin: 'meatball', key: 'isHidden' } as const, false)
/** A meatball standing at home in the middle of the bar with nothing on his plate. */
export const FRESH: Motion = {
  pose: 'none',
  mood: 'none',
  fill: 'normal',
  rolledMs: 0,
  since: null,
  isTurn: false,
  poseId: 0,
  turnId: 0,
  from: null,
  homeAt: 0,
}
const motion = atom({ plugin: 'meatball', key: 'motion' } as const, FRESH)

const width = atom({ plugin: 'meatball', key: 'width' } as const, null as number | null)
const agents = atom({ plugin: 'meatball', key: 'agents' } as const, {} as Agents)

/** His size on screen, in pixels: the sprite is 32×32 art scaled up crisply. */
const SIZE = 48
/** How fast he rolls, in pixels a second, whatever the window's width. */
const SPEED = 120
/**
 * The desktop reports the band in columns, not pixels: about this many
 * pixels to a column on the desktop app (95 columns came to about 1050px).
 */
const PX_PER_COLUMN = 11
/** Pixels kept free at the band's end for the close button. */
const CLOSE_ROOM = 48
const CHOMP_MS = 1200
const BOUNCE_MS = 1000
const HURT_MS = 2500
/** A quiet spell this long after a turn and he dozes off. */
const SLEEP_MS = 5 * 60 * 1000

/** The tools that change files: each one is a bite. */
const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit'])
/** The tools that run commands: he stands and watches them. */
const COMMAND_TOOLS = new Set(['Bash', 'PowerShell'])
/** The tools that stop and ask you something: he waits on you. */
const ASKING_TOOLS = new Set(['AskUserQuestion', 'ExitPlanMode'])

const RESULT_MS = 2500
const CELEBRATE_MS = 3500
/** A subagent counts as running while it has used a tool this recently. */
const AGENT_TTL_MS = 20_000
/** The agents strip shows at most this many mini meatballs. */
const MAX_AGENTS = 4

/** Commands that run a test suite. */
const TEST_COMMAND =
  /(?:^|[\s;&|(])(?:(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?test|npx\s+(?:jest|vitest|mocha)|jest|vitest|pytest|mocha|rspec|phpunit|go\s+test|cargo\s+test|dotnet\s+test|make\s+test|claude\s+plugin\s+test)\b/
/** Commands that open a pull request. */
const PR_COMMAND = /(?:^|[\s;&|(])gh\s+pr\s+create\b/

/** What a shell command is up to, for the mood he wears while it runs. */
export function activityOf(command: string): 'testing' | 'deliver' | 'busy' {
  if (PR_COMMAND.test(command)) return 'deliver'
  if (TEST_COMMAND.test(command)) return 'testing'
  return 'busy'
}

/** How many subagents are running: those seen using a tool in the last little while. */
export function agentCount(seen: Agents, now: number) {
  return Math.min(MAX_AGENTS, Object.values(seen).filter(at => now - at < AGENT_TTL_MS).length)
}

/** How round he is for a context window this full. */
export function fillFor(percent: number | undefined): Fill {
  return (percent ?? 0) >= 80 ? 'stuffed' : (percent ?? 0) >= 50 ? 'full' : 'normal'
}

/** Stop rolling, banking the stretch just rolled. */
export function halt(m: Motion, now: number): Motion {
  return { ...m, rolledMs: position(m, now), since: null }
}

/** Roll on from wherever he stopped. */
export function roll(m: Motion, now: number): Motion {
  return m.since === null ? { ...m, since: now } : m
}

/** Time spent rolling so far, from the middle: where he is along the bar. */
export function position(m: Motion, now: number) {
  return m.rolledMs + (m.since === null ? 0 : now - m.since)
}

/** How far into a lap he is, for the animations: a lap starts at the left end, he starts in the middle. */
function lapAt(m: Motion, now: number, lap: number) {
  return (position(m, now) + lap / 4) % lap
}

/** The bar's width in pixels: pinned by `/meatball width`, else from the band's columns. */
export function barWidth(pinned: number | null, columns: number | undefined) {
  return Math.max(SIZE * 4, pinned ?? Math.round((columns ?? 80) * PX_PER_COLUMN))
}

/** One trip out and back along a bar this wide, in milliseconds. */
export function lapMs(bar: number) {
  return Math.round(((bar - SIZE) * 2 * 1000) / SPEED)
}

/** How far along the bar he is, 0 at the left end to 1 at the right, and which way he faces. */
export function spot(m: Motion, now: number, lap: number) {
  return terminal.alongAt(position(m, now), lap)
}

/**
 * After a turn he hops where he stopped, then rolls home to the middle:
 * where he is on the way, how long is left, and whether he heads left.
 * Null while he is out working.
 */
export function walkHome(m: Motion, now: number, lap: number, travel: number) {
  if (m.from === null) return null
  const walk = terminal.homeward(terminal.alongAt(m.from, lap).along, travel, SPEED, now - m.homeAt)
  const isWalking = m.pose === 'none' && m.mood === 'none' && now >= m.homeAt && walk.leftMs > 0
  return { ...walk, isWalking }
}

/** Which way of standing still or moving he shows, most urgent first. */
export function look(m: Motion, isRolling: boolean) {
  const mood = (name: string) => `data-mood="${name}" data-idle=""`
  if (m.mood === 'alert') return mood('alert')
  if (m.pose === 'hurt' || m.pose === 'fail' || m.pose === 'pass' || m.pose === 'celebrate') return mood(m.pose)
  if (m.pose === 'chomp') return 'data-chomp=""'
  if (m.pose === 'bounce') return 'data-mouth="open"'
  if (m.mood !== 'none') return mood(m.mood)
  return isRolling ? 'data-roll=""' : 'data-idle=""'
}

/**
 * The bar the meatball lives on, `bar` pixels wide. Rolling out and back
 * while Claude works; stopping to chomp on edits, watch commands, wince at
 * errors or wait on you; hopping when a turn ends; dozing after a quiet
 * spell. A redraw restarts the animations, so they begin part-way in (a
 * negative begin), on the spot where he was.
 */
export function stage(m: Motion, now: number, isWorking: boolean, bar: number, helpers = 0) {
  const lap = lapMs(bar)
  const travel = bar - SIZE
  const home = walkHome(m, now, lap, travel)
  const isRolling = isRollingNow(m, isWorking)
  // Our classes and animations are prefixed mb- so they can't collide with the sprite's own.
  const ball = MEATBALL.replace(
    /<svg ([^>]*?)width="64" height="64"/,
    `<svg data-fill="${m.fill}" ${look(m, isRolling || Boolean(home?.isWalking))} $1width="${SIZE}" height="${SIZE}"`,
  )
  const along = home ? home.along : spot(m, now, lap).along
  const dur = `${lap / 1000}s`
  const begin = `-${lapAt(m, now, lap) / 1000}s`
  const trailLeft = `translateX(-${trailWidth(helpers) + 2}px)`
  const trailRight = `translateX(${SIZE + 2}px)`
  const css =
    '.mb-face{transform-box:fill-box;transform-origin:center;' +
    // On his way home he faces the middle; otherwise his facing follows the lap.
    (home
      ? `transform:scaleX(${home.isLeft ? -1 : 1})}`
      : `animation:mb-face ${dur} steps(1) infinite;animation-delay:${begin};` +
        `animation-play-state:${isRolling ? 'running' : 'paused'}}` +
        '@keyframes mb-face{0%{transform:scaleX(1)}50%{transform:scaleX(-1)}}') +
    (m.pose === 'bounce'
      ? `.mb-hop{animation:mb-hop ${BOUNCE_MS / 1000}s ease-out 1}` +
        '@keyframes mb-hop{0%,55%,100%{transform:translateY(0)}30%{transform:translateY(-9px)}75%{transform:translateY(-5px)}}'
      : '') +
    // The agents strip trails behind him: to his left heading out, his right heading back.
    (home
      ? `.mb-trail{transform:${home.isLeft ? trailRight : trailLeft}}`
      : `.mb-trail{animation:mb-trail ${dur} steps(1) infinite;animation-delay:${begin};` +
        `animation-play-state:${isRolling ? 'running' : 'paused'}}` +
        `@keyframes mb-trail{0%{transform:${trailLeft}}50%{transform:${trailRight}}}`)

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${bar} ${SIZE}" ` +
    `width="${bar}" height="${SIZE}" style="background:none">` +
    `<style>${css}</style>` +
    `<g transform="translate(${(along * travel).toFixed(1)} 0)">` +
    (isRolling
      ? `<animateTransform attributeName="transform" type="translate" ` +
        `values="0 0;${travel} 0;0 0" dur="${dur}" begin="${begin}" repeatCount="indefinite"/>`
      : home?.isWalking
        ? `<animateTransform attributeName="transform" type="translate" ` +
          `values="${(along * travel).toFixed(1)} 0;${(travel / 2).toFixed(1)} 0" dur="${home.leftMs / 1000}s" fill="freeze"/>`
        : '') +
    `<g class="mb-face"><g class="mb-hop">${ball}</g></g>` +
    (helpers > 0 ? `<g class="mb-trail">${trail(helpers)}</g>` : '') +
    `</g></svg>`
  )
}

/** One mini meatball is 11 of the strip's 44 units wide; the strip is drawn at his scale. */
const STRIP_SCALE = SIZE / 32

function trailWidth(helpers: number) {
  return Math.round(helpers * 11 * STRIP_SCALE)
}

/** The agents strip showing `helpers` mini meatballs, at his scale. */
function trail(helpers: number) {
  return AGENTS.replace(
    /<svg ([^>]*?)width="88" height="64"([^>]*?)data-agents="\d"/,
    `<svg $1width="${44 * STRIP_SCALE}" height="${SIZE}"$2data-agents="${helpers}"`,
  )
}

/** Fill in what an older meatball's saved state lacks. */
export function settle(m: Partial<Motion> | null | undefined): Motion {
  return { ...FRESH, ...m }
}

/**
 * Start or end something that lasts: he stops while it holds, and rolls on
 * from the same spot once it ends if the turn is still running.
 */
async function feel($: Pick<EngineInterface, 'state' | 'clock'>, mood: Mood, from?: Mood | Mood[]) {
  const now = await $.clock.now()
  await update($, motion, stored => {
    const was = settle(stored)
    if (from !== undefined && ![from].flat().includes(was.mood)) {
      return was
    }
    const next = { ...halt(was, now), mood }
    return mood === 'none' && was.isTurn && was.pose === 'none' ? roll(next, now) : next
  })
}

/**
 * Stop and strike a pose for a moment, then roll on if the turn is still
 * running. A later pose cancels an earlier one's ending.
 */
async function strike($: Pick<EngineInterface, 'state' | 'clock'>, pose: Pose, ms: number) {
  const now = await $.clock.now()
  const m = await update($, motion, stored => {
    const was = settle(stored)
    return { ...halt(was, now), pose, poseId: was.poseId + 1 }
  })
  $.clock.after(ms, () => {
    void (async () => {
      const later = await $.clock.now()
      await update($, motion, stored => {
        const was = settle(stored)
        if (was.poseId !== m.poseId) {
          return was
        }
        const rested = { ...was, pose: 'none' as const }
        return was.isTurn && was.mood === 'none' ? roll(rested, later) : rested
      })
    })()
  })
}

/** Whether he is rolling laps right now: no pose or mood holding him, and a turn under way, not on his way home. */
function isRollingNow(m: Motion, isWorking: boolean) {
  return m.pose === 'none' && m.mood === 'none' && m.from === null && (m.since !== null || isWorking)
}

/** How often the terminal line repaints while he moves, in milliseconds. */
const TICK_MS = 120

/**
 * The terminal has no CSS animations, so while he moves a timer asks for the
 * band to be drawn again; once he stands still it stops.
 */
let ticker: (() => void) | null = null

function stopTicking() {
  ticker?.()
  ticker = null
}

function keepTicking($: Pick<EngineInterface, 'clock' | 'ui'>) {
  if (ticker) {
    return
  }
  const timer = $.clock.every(TICK_MS, () => $.ui.invalidate('ui.render'))
  ticker = () => timer.cancel()
}

/** Send him away until `/meatball` brings him back. */
async function putAway($: Pick<EngineInterface, 'state'>) {
  stopTicking()
  await update($, isHidden, () => true)
}

/** What he is doing, for a screen reader. */
function describe(m: Motion) {
  if (m.mood === 'alert') return 'The meatball is waiting on you'
  if (m.pose === 'hurt') return 'The meatball winces: something failed'
  if (m.pose === 'fail') return 'The meatball groans: tests failed'
  if (m.pose === 'pass') return 'The meatball cheers: tests passed'
  if (m.pose === 'celebrate') return 'The meatball plants a flag: pull request opened'
  if (m.pose === 'chomp') return 'The meatball chomps an edit'
  if (m.mood === 'testing') return 'The meatball watches the tests run'
  if (m.mood === 'deliver') return 'The meatball carries a pull request'
  if (m.mood === 'busy') return 'The meatball watches a command run'
  if (m.mood === 'sleep') return 'The meatball is asleep'
  return 'A meatball rolling along'
}

/** Note a subagent at work, and redraw once it would age out of the count. */
async function sawAgent($: Pick<EngineInterface, 'state' | 'clock' | 'ui'>, id: string) {
  const now = await $.clock.now()
  await update($, agents, seen => {
    const fresh: Agents = { [id]: now }
    for (const [other, at] of Object.entries(seen ?? {})) {
      if (other !== id && now - at < AGENT_TTL_MS) fresh[other] = at
    }
    return fresh
  })
  $.clock.after(AGENT_TTL_MS + 250, () => $.ui.invalidate('ui.render'))
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const ran = await next(e)
    await $.command.register({
      name: 'meatball',
      description: 'Show or hide the meatball; /meatball width <px> or auto sets his bar',
    })
    // A reload starts him over at home in the middle, with nothing left mid-pose.
    const { context } = await $.session.usage()
    await update($, motion, stored => ({
      ...settle(stored),
      pose: 'none',
      mood: 'none',
      rolledMs: 0,
      since: null,
      from: null,
      fill: fillFor(context.percent),
    }))

    return ran
  })

  on('session.measure', async ($, e, next) => {
    const fill = fillFor(e.context.percent)
    await update($, motion, stored => {
      const was = settle(stored)
      return was.fill === fill ? was : { ...was, fill }
    })

    return next(e)
  })

  on('command.run', { command: 'meatball' }, async ($, e) => {
    const [word, value] = e.args.trim().split(/\s+/)
    if (word === 'width') {
      const px = Number(value)
      const pinned = await update($, width, () => (Number.isFinite(px) && px > 0 ? Math.round(px) : null))
      return { text: pinned ? `The meatball's bar is now ${pinned}px wide.` : 'The meatball sizes his bar to the window again.' }
    }

    const hidden = await update($, isHidden, was => !was)
    if (hidden) {
      stopTicking()
    }

    return { text: hidden ? 'The meatball rolled away.' : 'The meatball is back!' }
  })

  on('turn.start', async ($, e, next) => {
    const now = await $.clock.now()
    await update($, motion, stored => {
      const was = settle(stored)
      // He sets out from home (rolledMs 0, the middle), even if still on his way there.
      const awake = { ...was, isTurn: true, turnId: was.turnId + 1, from: null }
      return roll(was.mood === 'sleep' ? { ...awake, mood: 'none' } : awake, now)
    })

    return next(e)
  })

  // A permission prompt is on screen: he stops and waits on you. (Not every
  // "ask" verdict becomes a prompt: in auto mode a classifier settles most.)
  on('classic.PermissionRequest', async ($, e, next) => {
    await feel($, 'alert')

    return next(e)
  })

  on('classic.PermissionDenied', async ($, e, next) => {
    await feel($, 'none', 'alert')

    return next(e)
  })

  // You answered by typing: whatever he was waiting on is over.
  on('prompt.submit', async ($, e, next) => {
    await feel($, 'none', 'alert')

    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    // A subagent's or background task's tool: it adds a mini meatball to the
    // trail, and if it was what he was waiting on you for, it has now gone ahead.
    if (e.agentId) {
      await sawAgent($, e.agentId)
      const ran = await next(e)
      await sawAgent($, e.agentId)
      await feel($, 'none', 'alert')
      return ran
    }

    // A tool's arguments sit on the event itself: Bash's is `e.command`.
    const command =
      COMMAND_TOOLS.has(e.tool) && typeof (e as { command?: unknown }).command === 'string'
        ? (e as { command: string }).command
        : ''
    const activity = COMMAND_TOOLS.has(e.tool) ? activityOf(command) : null

    if (EDIT_TOOLS.has(e.tool)) {
      await strike($, 'chomp', CHOMP_MS)
    } else if (ASKING_TOOLS.has(e.tool)) {
      await feel($, 'alert')
    } else if (activity) {
      await feel($, activity)
    }

    const ran = await next(e)
    const failed = 'isError' in ran && Boolean(ran.isError)

    // Whatever he was waiting on or watching is over.
    await feel($, 'none', ['alert', 'busy', 'testing', 'deliver'])
    if (activity === 'testing') {
      await strike($, failed ? 'fail' : 'pass', RESULT_MS)
    } else if (activity === 'deliver' && !failed) {
      await strike($, 'celebrate', CELEBRATE_MS)
    } else if (failed) {
      await strike($, 'hurt', HURT_MS)
    }

    return ran
  })

  on('turn.complete', async ($, e, next) => {
    // He hops where he stopped, then rolls home to the middle.
    const now = await $.clock.now()
    const done = await update($, motion, stored => {
      const was = { ...settle(stored), isTurn: false, mood: 'none' as const }
      return was.from !== null
        ? was
        : { ...was, from: position(was, now), homeAt: now + BOUNCE_MS, rolledMs: 0, since: null }
    })
    await strike($, 'bounce', BOUNCE_MS)
    // Nothing for a while and he dozes off where he stands.
    $.clock.after(SLEEP_MS, () => {
      void update($, motion, stored => {
        const was = settle(stored)
        return was.turnId === done.turnId && !was.isTurn && was.mood === 'none'
          ? { ...was, mood: 'sleep' }
          : was
      })
    })

    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || (await read($, isHidden))) {
      stopTicking()
      return next(e)
    }

    // In a terminal he is one line of text: pixel art there is too big and striped.
    if (e.surface === 'terminal') {
      const { Box, Button, Text } = $.ui.resolve(e)
      const m = settle(await read($, motion))
      const now = await $.clock.now()
      const home = m.from === null ? null : terminal.placeHome(m.from, e.props.bodyColumns, now - m.homeAt)
      const isWalking = Boolean(home?.isWalking) && m.pose === 'none' && m.mood === 'none'
      const isRolling = isRollingNow(m, e.props.isWorking) || isWalking
      const { column, isReturning } = home ?? terminal.place(position(m, now), e.props.bodyColumns)
      if (terminal.isMoving(m, isRolling)) {
        keepTicking($)
      } else {
        stopTicking()
      }

      return (
        <Box>
          <Text>{' '.repeat(column)}</Text>
          {terminal.face(m, isRolling, isReturning, now, agentCount(await read($, agents), now)).map((piece, i) => (
            <Text key={`p${i}`} color={piece.color} bold>
              {piece.text}
            </Text>
          ))}
          <Text> </Text>
          <Button key="close" label="×" plain dimColor onPress={() => putAway($)} />
        </Box>
      )
    }

    const { Box, Button } = $.ui.resolve(e)
    const { Svg } = $.ui.resolve(e) as { Svg: (props: SvgProps) => JSX.Element }
    const m = settle(await read($, motion))
    const now = await $.clock.now()
    // Leave room at the end of the band for the close button.
    const bar = barWidth(await read($, width), e.props.bodyColumns) - CLOSE_ROOM
    // Once he is home, draw him again standing still.
    const home = walkHome(m, now, lapMs(bar), bar - SIZE)
    if (home?.isWalking) {
      $.clock.after(home.leftMs + 50, () => $.ui.invalidate('ui.render'))
    }

    return (
      // One row holds him: left unsized, the desktop gives the band's content far more height than
      // he needs. Heights count whole rows; pixels are refused.
      <Box width="100%" height={1} alignItems="center">
        {/*
          His bar is a guess from the band's columns, so it sits centered in
          the room left of the close button: his home is the true middle, and
          a guess too wide is trimmed evenly at both ends.
        */}
        <Box flexGrow={1} flexShrink={1} justifyContent="center" overflow="hidden">
          <Svg
            source={stage(m, now, e.props.isWorking, bar, agentCount(await read($, agents), now))}
            alt={describe(m)}
            width={bar}
            height={SIZE}
          />
        </Box>
        <Button key="close" label="✕" plain dimColor onPress={() => putAway($)} />
      </Box>
    )
  })
}

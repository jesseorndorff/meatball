import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, SvgProps } from 'claude-code'

import type { Fill, Mood, Motion, Pose } from '../types'
import { MEATBALL } from './meatball'
import * as terminal from './terminal'

const isHidden = atom({ plugin: 'meatball', key: 'isHidden' } as const, false)
/** A meatball standing at the left end with nothing on his plate. */
export const FRESH: Motion = {
  pose: 'none',
  mood: 'none',
  fill: 'normal',
  rolledMs: 0,
  since: null,
  isTurn: false,
  poseId: 0,
  turnId: 0,
}
const motion = atom({ plugin: 'meatball', key: 'motion' } as const, FRESH)

const width = atom({ plugin: 'meatball', key: 'width' } as const, null as number | null)

/** His size on screen, in pixels: the sprite is 32×32 art scaled up crisply. */
const SIZE = 48
/** How fast he rolls, in pixels a second, whatever the window's width. */
const SPEED = 120
/**
 * The desktop reports the band in columns, not pixels: about this many
 * pixels to a column on the desktop app (95 columns came to about 1050px).
 */
const PX_PER_COLUMN = 11
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

/** Time spent rolling so far: where he is along the bar. */
export function position(m: Motion, now: number) {
  return m.rolledMs + (m.since === null ? 0 : now - m.since)
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
  const phase = (position(m, now) % lap) / lap
  return { along: phase < 0.5 ? phase * 2 : 2 - phase * 2, isReturning: phase >= 0.5 }
}

/** Which way of standing still or moving he shows, most urgent first. */
export function look(m: Motion, isRolling: boolean) {
  if (m.mood === 'alert') return 'data-mood="alert" data-idle=""'
  if (m.pose === 'hurt') return 'data-mood="hurt" data-idle=""'
  if (m.pose === 'chomp') return 'data-chomp=""'
  if (m.pose === 'bounce') return 'data-mouth="open"'
  if (m.mood === 'busy') return 'data-mood="busy" data-idle=""'
  if (m.mood === 'sleep') return 'data-mood="sleep" data-idle=""'
  return isRolling ? 'data-roll=""' : 'data-idle=""'
}

/**
 * The bar the meatball lives on, `bar` pixels wide. Rolling out and back
 * while Claude works; stopping to chomp on edits, watch commands, wince at
 * errors or wait on you; hopping when a turn ends; dozing after a quiet
 * spell. A redraw restarts the animations, so they begin part-way in (a
 * negative begin), on the spot where he was.
 */
export function stage(m: Motion, now: number, isWorking: boolean, bar: number) {
  const isRolling = isRollingNow(m, isWorking)
  // Our classes and animations are prefixed mb- so they can't collide with the sprite's own.
  const ball = MEATBALL.replace(
    /<svg ([^>]*?)width="64" height="64"/,
    `<svg data-fill="${m.fill}" ${look(m, isRolling)} $1width="${SIZE}" height="${SIZE}"`,
  )
  const lap = lapMs(bar)
  const travel = bar - SIZE
  const { along } = spot(m, now, lap)
  const dur = `${lap / 1000}s`
  const begin = `-${(position(m, now) % lap) / 1000}s`
  const css =
    '.mb-face{transform-box:fill-box;transform-origin:center;' +
    `animation:mb-face ${dur} steps(1) infinite;animation-delay:${begin};` +
    `animation-play-state:${isRolling ? 'running' : 'paused'}}` +
    '@keyframes mb-face{0%{transform:scaleX(1)}50%{transform:scaleX(-1)}}' +
    (m.pose === 'bounce'
      ? `.mb-hop{animation:mb-hop ${BOUNCE_MS / 1000}s ease-out 1}` +
        '@keyframes mb-hop{0%,55%,100%{transform:translateY(0)}30%{transform:translateY(-9px)}75%{transform:translateY(-5px)}}'
      : '')

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${bar} ${SIZE}" ` +
    `width="${bar}" height="${SIZE}" style="background:none">` +
    `<style>${css}</style>` +
    `<g transform="translate(${(along * travel).toFixed(1)} 0)">` +
    (isRolling
      ? `<animateTransform attributeName="transform" type="translate" ` +
        `values="0 0;${travel} 0;0 0" dur="${dur}" begin="${begin}" repeatCount="indefinite"/>`
      : '') +
    `<g class="mb-face"><g class="mb-hop">${ball}</g></g></g></svg>`
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
async function feel($: Pick<EngineInterface, 'state' | 'clock'>, mood: Mood, from?: Mood) {
  const now = await $.clock.now()
  await update($, motion, stored => {
    const was = settle(stored)
    if (from !== undefined && was.mood !== from) {
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

/** Whether he is rolling right now: no pose or mood holding him, and a turn under way. */
function isRollingNow(m: Motion, isWorking: boolean) {
  return m.pose === 'none' && m.mood === 'none' && (m.since !== null || isWorking)
}

/** The terminal band's cells for this moment: where he is on the bar and how he looks. */
async function terminalFrame($: Pick<EngineInterface, 'state' | 'clock'>, columns: number, isWorking: boolean) {
  const m = settle(await read($, motion))
  const now = await $.clock.now()
  const isRolling = isRollingNow(m, isWorking)
  const { column, isReturning } = terminal.place(position(m, now), columns)
  return terminal.cells(terminal.paint(terminal.lookOf(m, isRolling), now / 1000), columns, column, isReturning)
}

/** How often the terminal band repaints, in milliseconds: about ten frames a second. */
const TICK_MS = 100

/**
 * The terminal has no CSS animations, so a timer repaints his Raster in place.
 * One timer for the band: a new site or width starts it over.
 */
let ticker: { site: string; columns: number; isWorking: boolean; stop: () => void } | null = null

function stopTicking() {
  ticker?.stop()
  ticker = null
}

function keepTicking($: Pick<EngineInterface, 'state' | 'clock' | 'ui'>, site: string, columns: number, isWorking: boolean) {
  if (ticker && ticker.site === site && ticker.columns === columns) {
    ticker.isWorking = isWorking
    return
  }
  stopTicking()
  const current = { site, columns, isWorking, stop: () => {} }
  const timer = $.clock.every(TICK_MS, () => {
    void (async () => {
      const painted = await $.ui.blit({
        requestId: site,
        key: 'meatball',
        cells: await terminalFrame($, columns, current.isWorking),
      })
      if (painted.deny && ticker === current) {
        stopTicking()
      }
    })()
  })
  current.stop = () => timer.cancel()
  ticker = current
}

/** What he is doing, for a screen reader. */
function describe(m: Motion) {
  if (m.mood === 'alert') return 'The meatball is waiting on you'
  if (m.pose === 'hurt') return 'The meatball winces: something failed'
  if (m.pose === 'chomp') return 'The meatball chomps an edit'
  if (m.mood === 'busy') return 'The meatball watches a command run'
  if (m.mood === 'sleep') return 'The meatball is asleep'
  return 'A meatball rolling along'
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const ran = await next(e)
    await $.command.register({
      name: 'meatball',
      description: 'Show or hide the meatball; /meatball width <px> or auto sets his bar',
    })
    // A reload starts him over where he stood, with nothing left mid-pose.
    const { context } = await $.session.usage()
    await update($, motion, stored => ({
      ...settle(stored),
      pose: 'none',
      mood: 'none',
      since: null,
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
      const awake = { ...was, isTurn: true, turnId: was.turnId + 1 }
      return roll(was.mood === 'sleep' ? { ...awake, mood: 'none' } : awake, now)
    })

    return next(e)
  })

  // A tool that needs your say-so: he stops and waits on you.
  on('tool.check', async ($, e, next) => {
    const verdict = await next(e)
    if (verdict.decision === 'ask') {
      await feel($, 'alert')
    }

    return verdict
  })

  on('tool.call', async ($, e, next) => {
    if (e.agentId) {
      return next(e)
    }

    if (EDIT_TOOLS.has(e.tool)) {
      await strike($, 'chomp', CHOMP_MS)
    } else if (ASKING_TOOLS.has(e.tool)) {
      await feel($, 'alert')
    } else if (COMMAND_TOOLS.has(e.tool)) {
      await feel($, 'busy')
    }

    const ran = await next(e)

    // Whatever he was waiting on or watching is over.
    await feel($, 'none', 'alert')
    await feel($, 'none', 'busy')
    if ('isError' in ran && ran.isError) {
      await strike($, 'hurt', HURT_MS)
    }

    return ran
  })

  on('turn.complete', async ($, e, next) => {
    const done = await update($, motion, stored => ({ ...settle(stored), isTurn: false, mood: 'none' }))
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

    // The terminal can't draw SVG: he is painted in half-block cells instead.
    if (e.surface === 'terminal') {
      if (e.props.maxRows < terminal.ROWS) {
        stopTicking()
        return next(e)
      }
      const { Raster } = $.ui.resolve(e)
      const columns = e.props.bodyColumns
      keepTicking($, e.requestId, columns, e.props.isWorking)

      return (
        <Raster
          key="meatball"
          columns={columns}
          rows={terminal.ROWS}
          cells={await terminalFrame($, columns, e.props.isWorking)}
        />
      )
    }

    const { Box } = $.ui.resolve(e)
    const { Svg } = $.ui.resolve(e) as { Svg: (props: SvgProps) => JSX.Element }
    const m = settle(await read($, motion))
    const bar = barWidth(await read($, width), e.props.bodyColumns)

    return (
      <Box width="100%">
        <Svg
          source={stage(m, await $.clock.now(), e.props.isWorking, bar)}
          alt={describe(m)}
          width={bar}
          height={SIZE}
        />
      </Box>
    )
  })
}

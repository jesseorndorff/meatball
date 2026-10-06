/**
 * A moment he strikes and then lets go of: a bite, the end-of-turn hop, a
 * wince at an error, a cheer or a groan at test results, a flag for a new PR.
 */
export type Pose = 'none' | 'chomp' | 'bounce' | 'hurt' | 'pass' | 'fail' | 'celebrate'

/**
 * How he is while something lasts: waiting on you, watching a command run,
 * goggles on for tests, carrying a PR out, or asleep after a quiet spell.
 */
export type Mood = 'none' | 'alert' | 'busy' | 'testing' | 'deliver' | 'sleep'

/** Subagents and background tasks seen working: agent id -> when last seen, in ms. */
export type Agents = Record<string, number>

/** How round he is: how full the context window is. */
export type Fill = 'normal' | 'full' | 'stuffed'

/**
 * Where the meatball is and what he is doing. His place along the bar is kept
 * as time spent rolling, so a redraw (which restarts the SVG's animations)
 * puts him back on the same spot.
 */
export type Motion = {
  pose: Pose
  mood: Mood
  fill: Fill
  /** Milliseconds rolled before the current stretch, counted from the middle of the bar heading right. */
  rolledMs: number
  /** When the current stretch of rolling began, or null while he stands still. */
  since: number | null
  /** Whether a turn is running, so he knows to roll on after a pose. */
  isTurn: boolean
  /** Counts poses, so only the latest pose's timer ends it. */
  poseId: number
  /** Counts turns, so a sleep timer from a quiet spell that ended does nothing. */
  turnId: number
  /** Where a turn left him (time rolled) as he heads home to the middle, or null once a turn starts. */
  from: number | null
  /** When he sets off home: just after the end-of-turn hop. */
  homeAt: number
}

/** `/meatball width <px>` pins the bar's width; null works it out from the band's columns. */
declare module 'claude-code' {
  interface PluginState {
    'meatball': { isHidden: boolean; motion: Motion; width: number | null; agents: Agents }
  }
}

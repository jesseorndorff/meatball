/** A moment he strikes and then lets go of: a bite, the end-of-turn hop, a wince at an error. */
export type Pose = 'none' | 'chomp' | 'bounce' | 'hurt'

/**
 * How he is while something lasts: waiting on you, watching a command run,
 * or asleep after a quiet spell.
 */
export type Mood = 'none' | 'alert' | 'busy' | 'sleep'

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
  /** Milliseconds rolled before the current stretch. */
  rolledMs: number
  /** When the current stretch of rolling began, or null while he stands still. */
  since: number | null
  /** Whether a turn is running, so he knows to roll on after a pose. */
  isTurn: boolean
  /** Counts poses, so only the latest pose's timer ends it. */
  poseId: number
  /** Counts turns, so a sleep timer from a quiet spell that ended does nothing. */
  turnId: number
}

/** `/meatball width <px>` pins the bar's width; null works it out from the band's columns. */
declare module 'claude-code' {
  interface PluginState {
    'meatball': { isHidden: boolean; motion: Motion; width: number | null }
  }
}

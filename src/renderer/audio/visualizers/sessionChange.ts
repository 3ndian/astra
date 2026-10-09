// Decides what a visualizer does when playback changes (pure, so it can be tested).
//
//  reset: clear the display and start fresh
//  hold:  keep the picture exactly as it is (pause, resume)
//  track: a new track started but the history stays; history views draw a divider

export type SessionChangeAction = 'reset' | 'hold' | 'track'

export type SessionChangeEvent =
  | { event: 'track' }
  | { event: 'state'; previous: string; next: string }

export function resolveSessionChange(change: SessionChangeEvent, keepAcrossTracks: boolean): SessionChangeAction {
  if (keepAcrossTracks) {
    // History views keep everything, even through stop and the next song. The divider marks the join.
    return change.event === 'track' ? 'track' : 'hold'
  }
  if (change.event === 'track') return 'reset'
  if (change.next === 'paused') return 'hold'
  if (change.previous === 'paused' && change.next === 'playing') return 'hold'
  return 'reset'
}

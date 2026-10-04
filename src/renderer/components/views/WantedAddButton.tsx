import { useEffect } from 'react'
import type { WantedAddRequest } from '../../../types/spotify'
import { useWantedStore } from '../../stores/wantedStore'

interface Props {
  request: WantedAddRequest
  compact?: boolean
}

/** "+" for a Spotify song: adds it to Music as a "Not downloaded" entry. */
export default function WantedAddButton({ request, compact = false }: Props) {
  const isWanted = useWantedStore((state) => state.ids.has(request.spotifyTrackId))
  const isAdding = useWantedStore((state) => state.adding.has(request.spotifyTrackId))
  const add = useWantedStore((state) => state.add)
  const refresh = useWantedStore((state) => state.refresh)

  useEffect(() => {
    void refresh()
  }, [refresh])

  if (isWanted) {
    return <span className="wanted-add wanted-add-done" title="On your Not downloaded list">{compact ? '✓' : '✓ Not downloaded'}</span>
  }
  return (
    <button
      type="button"
      className="wanted-add"
      disabled={isAdding}
      onClick={() => void add(request)}
      title="Add to Music as a Not downloaded entry"
      aria-label={`Add ${request.title} to Music as Not downloaded`}
    >
      {compact ? '+' : '+ Add to Music'}
    </button>
  )
}

import { useSpotifyStore } from '../../stores/spotifyStore'

export default function SpotifyHandoffPrompt() {
  const pending = useSpotifyStore((state) => state.pendingPrompt)
  const answerPrompt = useSpotifyStore((state) => state.answerPrompt)
  if (!pending) return null

  return (
    <div className="spotify-handoff-prompt" role="alertdialog" aria-label="Spotify is still playing">
      <div className="spotify-handoff-text">Spotify is still playing. Pause it?</div>
      <div className="spotify-handoff-actions">
        <button type="button" onClick={() => answerPrompt('once')}>Pause Spotify</button>
        <button type="button" onClick={() => answerPrompt('always')}>Always pause Spotify</button>
        <button type="button" onClick={() => answerPrompt('keep')}>Keep both</button>
      </div>
    </div>
  )
}

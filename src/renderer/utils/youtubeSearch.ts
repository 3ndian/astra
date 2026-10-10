/** Opens a YouTube search for "artist title" in the default browser. */
export function searchOnYouTube(track: { title?: string | null; artist?: string | null } | null | undefined): void {
  if (!track) return
  const query = [track.artist, track.title].map((part) => (part ?? '').trim()).filter(Boolean).join(' ')
  if (!query) return
  void window.electronAPI.searchYouTube(query).catch((error: unknown) => console.error('Could not open YouTube', error))
}

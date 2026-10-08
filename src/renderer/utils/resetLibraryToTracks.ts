import { useLibraryStore } from '../stores/libraryStore'

/** Leaves any album/artist/genre detail and lands on the Tracks tab. */
export function resetLibraryToTracks(): void {
  const library = useLibraryStore.getState()
  void library.clearSelection().then(() => {
    useLibraryStore.getState().setViewMode('tracks')
  })
}

# Sections + audiobook groundwork (work in progress)

## What's in
- **Library sections**: separate libraries (Music default, Audiobooks, custom). Each section has its own
  database, folders, playlists, ratings and stats; nothing mixes. Music keeps the existing `library.db`
  (no migration); other sections live in `<userData>/sections/<id>/`.
- Sidebar section switcher (top of the left rail): switch, create, rename, delete, per-section toggles for
  Last.fm scrobbling / Discord presence / listening stats (Audiobooks default to all off).
- Switching a section stops playback, clears the queue, and reloads the library.
- App-wide settings (Last.fm login, tokens, pairings) stay shared; they are always stored in the Music DB.
- `.m4b` files are only indexed in audiobook sections.

## Files
- new: `src/shared/sections/sections.ts` (+ `.test.ts`), `src/types/sections.ts`,
  `src/main/services/sectionsStore.ts`, `src/renderer/stores/sectionsStore.ts`,
  `src/renderer/components/layout/SectionSwitcher.tsx`
- changed: `src/main/services/library.ts` (per-section init/switch, meta routing, m4b gating),
  `src/main/index.ts` (startup restore, `sections:*` IPC, scrobble/stats gating), `src/preload/index.ts`,
  `src/renderer/env.d.ts`, `src/renderer/App.tsx`, `src/renderer/stores/playerStore.ts`
  (`resetPlaybackForSectionSwitch`), `src/renderer/hooks/useDiscordPresence.ts`,
  `src/renderer/components/layout/Sidebar.tsx`, `src/renderer/styles/globals.css`

## Verified
- `node --experimental-strip-types --test src/shared/sections/sections.test.ts` (8 passing)
- `sections.ts` passes `tsc --strict`.

## NOT verified (could not install dependencies in the build environment)
Everything that touches Electron/React. Run `npm install`, `npm run typecheck`, `npm run dev`, then try:
create a section, switch to it, add a folder, switch back, restart the app.

## Not built yet
Audiobook chapters / resume / skip buttons / sleep timer / bookmarks / speed (the audio engine has no
time-stretch, so speed is a real engine task), Spotify control (macOS then Linux), placeholder entries.

## Lyrics sidecar (.lrc) saving + Lyrics folder

- "Save .lrc" button in the Info sidebar lyrics tab writes the current lyrics as a `.lrc` sidecar.
  Audio files are never opened for writing; an existing sidecar is never overwritten.
- Settings > Lyrics > "Lyrics Folder": optional folder that mirrors your library layout
  (`<Lyrics>/<library folder name>/<subfolders>/<song>.lrc`). When unset, files go beside the audio.
  Lookup checks beside the audio first, then the Lyrics folder (`.xlrc` before `.lrc`).
- Tracks outside every library folder are skipped (never written beside the audio in folder mode).
- Files: `src/shared/lyrics/sidecarExport.ts`, `src/main/services/lyricsSidecar{Writer,Location}.ts`,
  IPC `lyrics:saveSidecar/getSidecarFolder/chooseSidecarFolder/clearSidecarFolder`.
- Tests: `npm run test:lyrics-sidecar` (14 passing here; UI + IPC untested, needs a Mac run).

## Ideas noted (not built)

- Full-area visualizer view: a visualizer that covers the track list region (below the existing visualizers, above the transport controls), Windows Media Player XP style, with an option to show the top visualizers or hide them.
- Classic Spotify-style layout option: playlists as a list in the left sidebar, with a large album cover docked at the bottom-left corner.

## Latest batch

- Lyrics options are now one small "..." menu (Refresh lyrics, Save as .lrc).
- Info <-> Lyrics tab switch slides (lyrics in from the right, details from the left).
- Lyrics folder + Save .lrc (see above).
- `scripts/tools/lastfm-to-astra.mjs`: Last.fm CSV/JSON -> Astra import file (re-runnable, no doubling).
- Spotify view (macOS): sidebar Spotify icon. Shows cover/title/artist/album, progress, play/pause,
  next, previous and seek for the Spotify desktop app via AppleScript. No Spotify login needed.
  First use triggers a macOS "wants to control Spotify" prompt; if denied, enable it in
  System Settings > Privacy & Security > Automation. Packaged builds got the Apple Events entitlement
  and usage text (package.json + resources/entitlements.mac.plist).
  NOT built yet: listen history, "+" placeholders, Linux, pausing Astra's own audio when Spotify plays.
  Unverified: whether Spotify still exposes `artwork url` (if the cover stays blank, tell me).
- Tests: `npm run test:spotify` (4 pass here), `npm run test:lyrics-sidecar`.
- Hover button on the bottom-left album cover that expands it to the old-Spotify layout: the left pane widens to the width of the cover/title/heart block, the cover grows docked at the bottom-left, playlists listed above it. Same button collapses back to the icon rail. Per-section remembered.
- Quick lyrics import: drag a .lrc/.xlrc onto the lyrics panel; bulk-match many .lrc files to tracks by filename.
- Easy lyrics resync: quick nudge buttons (-0.5s / +0.5s, "sync here") in the lyrics menu or lyrics panel; the per-track sync offset already exists in the lyrics editor panel (right-click a track), but it is buried.

## Fix: very long audiobooks (500+ min) ran out of memory

Cause: loudness analysis (ffmpeg ebur128) logged a line per 100 ms, overflowing its stderr buffer
(ERR_CHILD_PROCESS_STDIO_MAXBUFFER) and timing out at 3 min. With normalization on, progressive playback
required that result, so when it failed the player fell back to decoding the WHOLE file into memory
(~10 GB for 500 min). Not the visualizers.
Fix: `framelog=quiet` + size-scaled timeout (main/index.ts); tracks over ~45 min decoded size stream
without a loudness pass and without normalization (playerStore.ts, AudioEngine.ts `allowMissingLoudness`).

## Spotify as a second source (one transport bar)
- `stores/spotifyStore.ts`: watcher, active source, handoff preference (ask/always/never). Starts only after the Spotify view has been opened once.
- `SpotifyTransportBar.tsx` replaces the normal bar while Spotify is the active source (cover, title, seek, prev/play/next, Spotify volume slider).
- `SpotifyHandoffPrompt.tsx`: "Pause Spotify / Always pause / Keep both".
- `useCoverArtAccent`: takes the accent from the Spotify cover when Spotify is active.
- Starting Spotify pauses Astra; Astra never scrobbles Spotify.

## Spotify listen history
- `shared/spotify/playTracker.ts`: a play counts after 30 s heard (or half of a very short track); ads/podcasts skipped; repeats counted.
- `main/services/spotifyHistory.ts` + `openSpotifyHistory.ts`: own database `spotify-history.db` in userData (never the library). ~500 newest 300 px JPEG thumbnails, shared per album cover.
- Recording happens in main (SpotifyBridge `onStatus`), so it works whenever the Spotify watcher polls.
- `SpotifyHistoryList.tsx`: sortable by title/artist/album/played, search, "show more".
- Not yet: "+" placeholders and real-file takeover.

## Sidebar section rail
- `shared/sections/sectionStyle.ts` (+ test): colour per section, pinned sections (max 3, default Music/Audiobooks/first custom), active section always visible.
- `SectionSwitcher.tsx`: pinned section icons (music note, book, letters for custom) + "all sections" grid button; the popup has Pin/Pinned per section. Pins are saved in localStorage (`astra-pinned-sections-v1`).
- Spotify "when a local song starts" option moved behind the "..." button on the Spotify page.

## "Not downloaded" list (the "+" button)
- Own table `wanted_tracks` in the Music database; NOT rows of `tracks`, so never playable/queued/shuffled/counted.
- "+" on the now-playing card and on each history row; permanent 640 px cover + 300 px thumb.
- `library.scanFolder` reports newly imported files (Music section only); `WantedTracksStore.fulfill` clears entries with the same title + an overlapping artist (album ignored, remaster/explicit/feat tags ignored).
- New page `WantedView` (nav item "Not downloaded", shown in Music once Spotify is enabled): sort, search, Copy list, remove.
- Not yet: showing them greyed in the main track list, cover takeover onto the real file, loose-match confirmation, drag-and-drop import.

## Per-section page memory
- `shared/sections/sectionViewMemory.ts` (+ test) and the `sections.onSwitched` handler in `App.tsx`: leaving a section saves its page (home/library/stats/playlist/...), the library browse mode and the open playlist (localStorage `astra-section-view-memory-v1`); returning restores them. A deleted playlist falls back to the library page.

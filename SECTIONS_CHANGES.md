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

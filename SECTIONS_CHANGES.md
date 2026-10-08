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

## Expanded left pane (old-Spotify layout)
- `uiStore.isSidebarExpanded` (localStorage `astra-sidebar-expanded-v1`), toggle button at the bottom of the left pane.
- Expanded: pane widens to the now-playing block width, nav items and sections show labels, `SidebarCover` shows a big cover above the title/heart block (click = fullscreen; Spotify cover while Spotify is the source). The small cover in the bottom bar is hidden while expanded.
- Visualizer strip shown/hidden is now remembered per section (part of the section memory).

## Custom theme editor
- `shared/theme/customTheme.ts` (+ test, `npm run test:theme`): one accent -> backgrounds, borders and text derived (hue follows the accent, tint strength, lightness, hue shift, text contrast). Derived text is kept readable automatically; hand-picked colours only get a warning. Dark themes only.
- `themeStore`: `customTheme` (active, persisted in `astra-theme-settings-v1`), `savedCustomThemes` (`astra-custom-themes-v1`, up to 12), actions start/update/override/reset/exit/save/activate/delete. Choosing a preset leaves custom mode. The existing accent picker edits the custom theme's accent while one is active.
- `CustomThemeEditor.tsx` card at the top of Settings > Appearance: follow-accent switch, sliders, per-colour overrides ("Back to automatic"), save/update/delete, back to presets.

## Section colours
- `SectionConfig.color` (optional #rrggbb), `setSectionColor`, IPC `sections:setColor`; the section's "..." settings in the sections popup has an icon colour picker with "Automatic". The "e.g. Video Game Music" placeholder in the new-section box is now just "Section name".
- Multiple custom themes: "Save as new theme", "New custom theme" (asks before discarding unsaved edits), "Delete saved theme". Saved custom themes now appear in the Appearance grid next to the presets with a colour-swatch strip (background, panel, accent); presets show the same strip.

## Greyed "Not downloaded" rows in the Music track list
- Off by default. Switch on from the Not downloaded page ("Also show these greyed out...") or hide again with the "Hide" button in the group header.
- Shown only in the Music section, only on the main Tracks view (not inside an album/artist), as a separate "Not downloaded (N)" group after the real tracks; follows the search box. Rows are display-only: no play, queue, drag, context menu, shuffle or stats.
- `trackListRows.ts` (+ test) gained 'placeholder-header' / 'placeholder' row kinds; `useWantedPlaceholders` loads them; `wantedStore.showInTrackList` is saved in localStorage `astra-wanted-in-tracklist-v1`.

## Audiobook resume position
- `shared/resume/resumePositions.ts` (+ test): remembers where each file stopped (min 15 s in, "finished" within 30 s of the end clears it, resumes 3 s earlier, 300 entries max).
- `utils/audiobookResume.ts`: only active while an Audiobook-kind section is the active section. Saves every 5 s, on pause, when switching files and on quit (localStorage `astra-resume-positions-v1`). `playerStore._loadAndPlayTrack` starts at the saved spot unless a start time is given.

## Reorderable library tabs (per section)
- Drag the tabs (Tracks/Albums/Artists/Genres/Years/Folders) to reorder them, or focus one and press Alt+Left / Alt+Right. Each section keeps its own order (localStorage `astra-library-tab-order-v1`); a small reset button appears when the order is customised.
- `shared/library/tabOrder.ts` (+ test), `hooks/useLibraryTabOrder.ts`; the tab slide direction follows the custom order.

## Folders view keyboard navigation (Finder-style)
- Click a row to highlight it (folders still open/close on click); the tree takes keyboard focus.
- Up/Down move, Home/End jump, Right opens a folder (then steps into it), Left closes it or jumps to the parent folder, Enter plays the selected song (on a folder it opens/closes it).
- `shared/library/folderNav.ts` (+ test) holds the rules; `FolderTreeView.tsx` wires them in.

## Audiobook skip buttons + sleep timer
- `AudiobookControls.tsx` (next to repeat in the transport bar, only while an Audiobook section is active): back 10 s, forward 30 s, and a moon button with a sleep timer menu (the app's existing minutes timer from `sleepTimerStore.ts`, plus "End of this file", +15, turn off) and a countdown on the button.
- `sleepEndOfFileStore.ts` + `shared/sleepTimer.ts` (+ test) add the end-of-file variant; its watcher is started in `App.tsx`. `sleepTimerStore.ts` is the original upstream file (Settings uses it) and is NOT changed.

## Detached visualizer windows remember their place
- Each popped-out visualizer (spectrum, spectrogram, ...) saves its size and position (`scope-popout-windows.json` in userData, debounced while moving, and on close) and reopens there. If the saved spot is no longer on a connected display, the size is kept and the position falls back to the default.
- The "detached" placeholder in the main window gets a **Reset window** button next to Recall: puts that window back to its default size/position on the current screen, brings it to the front and forgets the saved spot (IPC `scope-popout:reset`).
- `shared/scopePopout/windowBounds.ts` (+ test) holds the display-safety rules; `main/services/scopePopoutWindowPrefs.ts` the file I/O.

## Add a Spotify song to a playlist (right-click)
- Right-click the Spotify now-playing card or a history row: pick a playlist; the song is saved there as a "missing" playlist entry (fake path `spotify:track:<id>` + title/artist/album). It is NOT added to the library, stays greyed/unplayable, and links up automatically by metadata when the real file is imported (existing playlist reconcile).
- Option "Also add to Not downloaded" (default on, remembered in `astra-spotify-playlist-also-wanted-v1`).
- `shared/spotify/playlistEntry.ts` (+ test), `library.addSpotifyPlaceholderToPlaylist`, IPC `library:addSpotifyTrackToPlaylist`, `SpotifyPlaylistMenu.tsx`.

## Folders view remembered per section
- `sectionViewMemory` also stores which folders were open and the scroll position (`folderExpanded`, `folderScrollTop`); `App.tsx` saves them when you leave a section and restores them after the section's library loads (a section with no memory starts collapsed).

## Milkdrop visuals (Butterchurn)
- Fullscreen player has a "Milkdrop" toggle. It replaces the backdrop with a Butterchurn WebGL canvas driven by the post-EQ analyser. Controls fade after 3 s of no mouse movement; double-click the visual for a random preset.
- Bundled presets come from `butterchurn-presets`; imported Butterchurn `.json` presets (single or packs) are stored in `<userData>/milkdrop-presets`.
- Raw `.milk` files are rejected with a clear message: they need converting to Butterchurn JSON first.
- Not available in bit-perfect mode (no Web Audio tap); a notice says so.
- Requires: `npm install butterchurn butterchurn-presets`.

## Milkdrop favorites and folders
- ☆/★ button favorites the current preset. "Folders" opens a panel to tick the preset into folders, make, rename and delete folders (deleting a folder keeps the presets).
- "Show" filters the dropdown to All / Favorites / My imports / any folder. Next, previous, shuffle and auto-cycle all stay inside the chosen list, so a "Chill" folder plus Auto gives a themed loop.
- Stored by preset name in localStorage with the other Milkdrop settings.

## Milkdrop flicker fixes + quality
- Paused: the visual freezes on its last frame (it used to redraw at ~5 fps, which looked like flicker).
- The audio connection is kept when the analyser is briefly missing (track change), instead of disconnecting and going silent.
- A preset only reloads when you actually change it, not when the preset list changes.
- New Quality (Low/Medium/High) and FPS (30/60) selectors in the Milkdrop bar.

## Draggable left pane
- Drag the right edge of the expanded left pane to resize (220–520 px, never more than half the window). Double-click the edge, or press Home/Esc while it is focused, to reset; Left/Right arrows nudge it. Width is remembered.
- The bottom player bar's info block follows the pane width.
- Expanded rows are tighter (32 px tall, 2 px gap). Tweak `--sidebar-expanded-item-height` and `--sidebar-expanded-gap` in globals.css.

## Track info pane: same layout on Info and Lyrics
- Header, tabs, cover and title are pinned; only the section below scrolls (Info details, or the lyrics list), so the cover never shifts when you switch tabs. Cover is capped at 38% of the window height (30% on Lyrics) and resizes smoothly.

## Output device: follow the system default + quick picker
- When the OS default output changes (AirPods connect/disconnect) and the app is set to "System Default", playback moves to the new device automatically (standard and bit-perfect modes). A device picked explicitly in Settings stays pinned.
- New speaker button next to the volume control opens a "Play on" list of outputs. When the transport info line is set to show the output, clicking it opens the same list.

## Fullscreen never gets stuck on Milkdrop
- The player UI only fades away while Milkdrop is actually drawing; if it is still loading or waiting for audio you keep the normal backdrop and controls ("Play a song to start Milkdrop").
- The exit button stays visible (dimmed) even when the rest of the UI fades.

## Left pane: expand arrow on top + fullscreen crash guard
- Compact rail: the expand arrow now sits at the top (the same spot as when expanded), the section rail below it, then the nav icons. Settings stays at the bottom in compact and top-right when expanded.
- Fullscreen player is wrapped in an error boundary: if it ever throws, it closes (and turns Milkdrop off) instead of leaving a blank app.

## Section-switch timing logs (diagnostic only)
- Switching sections prints a timing breakdown: in the terminal running `npm run dev` for the main process (db close/open, registry save), and in the DevTools console for the renderer (history flush, main-process wait, each list query, playlists, ratings, total). The slowest step is marked `<--`.

## Album pitch colours, Milkdrop background, audiobook extras
- Spectrum can colour bars/curve by pitch using the playing cover's palette (Analyzer edit overlay: "Album colours"). Popout scope windows are unchanged.
- Settings, Appearance: "Visual background" draws Milkdrop behind the whole app with translucent panels.
- Audiobook sections: progress cue (chapter, percent, time left), chapter skip, and bookmarks with notes saved as `<file>.bookmarks.md` beside the audio file. Chapters are read from the file when it has them (M4B/MP4, MP3 CHAP).
- Fix: Milkdrop preset import/list used `window.api`; it is `window.electronAPI`.

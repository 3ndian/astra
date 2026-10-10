export interface SettingsSectionDefinition {
  id: string
  label: string
  keywords: readonly string[]
  hidden?: boolean
  /** Heading the entry sits under in the settings navigation. */
  group: SettingsNavGroup
}

export type SettingsNavGroup = 'look' | 'music' | 'connections' | 'app'

export const SETTINGS_NAV_GROUPS: readonly { id: SettingsNavGroup; label: string }[] = [
  { id: 'look', label: 'Look and feel' },
  { id: 'music', label: 'Music' },
  { id: 'connections', label: 'Connections' },
  { id: 'app', label: 'App' }
]

export const SETTINGS_SECTIONS = [
  {
    id: 'appearance',
    label: 'Appearance',
    keywords: ['theme', 'accent', 'tint', 'album colour', 'album color', 'scale', 'header',  'cover art', 'color', 'visual', 'dark', 'light', 'background', 'playlist header', 'adaptive'],
    group: 'look'
  },
  {
    id: 'analyzer',
    label: 'Visuals',
    keywords: ['milkdrop', 'background', 'blur', 'opacity', 'history', 'trail', 'placement', 'fft', 'visualizer', 'pitch lock', 'oscilloscope', 'spectrum', 'equalizer', 'eq', 'waveform'],
    group: 'look'
  },
  {
    id: 'library',
    label: 'Library',
    keywords: [
      'folders',
      'rescan',
      'scan',
      'music',
      'metadata',
      'artist',
      'artist parsing',
      'file tags',
      'astra resolve',
      'resolve',
      'identity',
      'grouping',
      'import',
      'path',
      'replaygain',
      'normalization',
      'loudness',
      'gain',
      'subsonic',
      'navidrome',
      'jellyfin',
      'remote source',
      'remote server',
      'rating',
      'ratings',
      'stars',
      'star rating'
    ],
    group: 'music'
  },
  {
    id: 'playback',
    label: 'Playback',
    keywords: ['track click', 'double click', 'click', 'sleep timer', 'timer', 'countdown', 'pause', 'fade', 'fade in', 'fade out', 'audio transitions', 'gapless', 'crossfade', 'shuffle', 'repeat', 'jump to playing', 'now playing', 'queue', 'playlist', 'album', 'artist'],
    group: 'music'
  },
  {
    id: 'audio',
    label: 'Audio output',
    keywords: ['output', 'device', 'routing', 'delay', 'channel', 'sample rate', 'bit depth', 'buffer', 'latency', 'spatial', 'binaural', 'hrtf', 'headphones', 'speaker room', 'virtual speakers', 'upmix', 'surround'],
    group: 'music'
  },
  {
    id: 'integrations',
    label: 'Integrations',
    keywords: [
      'discord',
      'local api',
      'api key',
      'port',
      'controls',
      'webhook',
      'last.fm',
      'lastfm',
      'scrobble',
      'scrobbling',
      'lyrics',
      'lyric',
      'xlrcdb',
      'lrclib'
    ],
    group: 'connections'
  },
  {
    id: 'devices',
    label: 'Devices',
    keywords: ['hardware', 'astra thing', 'car thing', 'connect', 'pair', 'pairing', 'controller', 'usb', 'companion'],
    group: 'connections'
  },
  {
    id: 'parallax',
    label: 'Parallax',
    keywords: ['parallax', 'zone', 'speaker', 'speakers', 'sink', 'host', 'multi-room', 'multiroom', 'sync', 'pair', 'pairing', 'lan'],
    // Experimental feature: hidden until revealed by the "Enable Parallax" master toggle in the
    // Experimental section (mirrors the Developer-section reveal pattern).
    hidden: true,
    group: 'connections'
  },
  {
    id: 'keybinds',
    label: 'Keybinds',
    keywords: ['keyboard', 'shortcut', 'shortcuts', 'keybind', 'binding', 'mouse', 'back', 'forward', 'controls'],
    group: 'app'
  },
  {
    id: 'experimental',
    label: 'Experimental',
    keywords: ['experimental', 'beta', 'preview', 'graph', 'relationships', 'artists', 'visualization', 'network', 'integrity', 'scan', 'flac', 'quality', 'activity', 'indicator', 'scope rail', 'controller', 'gamepad', 'xbox', 'playstation', 'stats', 'listening history', 'play count'],
    group: 'app'
  },
  {
    id: 'info',
    label: 'About',
    keywords: ['version', 'updates', 'license', 'support', 'ko-fi', 'about', 'changelog', 'transfer', 'settings transfer', 'import settings', 'export settings', 'portable', 'move computers', 'backup', 'restore'],
    group: 'app'
  },
  {
    id: 'developer',
    label: 'Developer',
    keywords: ['memory', 'diagnostics', 'debug', 'log', 'logging', 'heap', 'bundle', 'profiling', 'developer'],
    hidden: true,
    group: 'app'
  },
  {
    id: 'danger',
    label: 'Danger Zone',
    keywords: ['reset', 'factory reset', 'clear', 'danger', 'troubleshoot', 'delete', 'wipe', 'ratings', 'reset ratings'],
    group: 'app'
  }
] as const satisfies readonly SettingsSectionDefinition[]

export type SettingsSectionId = (typeof SETTINGS_SECTIONS)[number]['id']
export const NON_HIDDEN_SETTINGS_SECTIONS = SETTINGS_SECTIONS.filter(
  (section) => !('hidden' in section && section.hidden)
)

export interface NavEntry {
  id: string
  label: string
  view: 'home' | 'library' | 'stats' | 'graph' | 'eq' | 'settings' | 'playlist'
  keywords: string[]
}

export const NAV_ENTRIES: NavEntry[] = [
  { id: 'nav:eq', label: 'Equalizer', view: 'eq', keywords: ['eq', 'equalizer', 'bands', 'frequency', 'bass', 'treble'] },
  { id: 'nav:graph', label: 'Library Graph', view: 'graph', keywords: ['graph', 'network', 'artists', 'relationships', 'collab', 'collaboration', 'map'] },
  { id: 'nav:stats', label: 'Listening Stats', view: 'stats', keywords: ['stats', 'listening', 'history', 'plays', 'play count', 'time'] },
  { id: 'nav:library', label: 'Library', view: 'library', keywords: ['library', 'tracks', 'songs', 'browse', 'collection'] },
  { id: 'nav:home', label: 'Home', view: 'home', keywords: ['home', 'dashboard', 'main'] },
  { id: 'nav:playlist', label: 'Playlists', view: 'playlist', keywords: ['playlist', 'playlists', 'list'] }
]

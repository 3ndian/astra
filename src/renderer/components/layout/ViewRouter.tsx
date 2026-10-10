import { useUIStore } from '../../stores/uiStore'
import LibraryView from '../views/LibraryView'
import GraphView from '../views/GraphView'
import EQView from '../views/EQView'
import HomeView from '../views/HomeDashboardView'
import SettingsView from '../views/SettingsView'
import PlaylistView from '../views/PlaylistView'
import StatsView from '../views/StatsView'
import SpotifyView from '../views/SpotifyView'
import WantedView from '../views/WantedView'

function renderView(view: string): React.ReactElement {
  switch (view) {
    case 'library':
      return <LibraryView />
    case 'stats':
      return <StatsView />
    case 'graph':
      return <GraphView />
    case 'eq':
      return <EQView />
    case 'settings':
      return <SettingsView />
    case 'playlist':
      return <PlaylistView />
    case 'spotify':
      return <SpotifyView />
    case 'wanted':
      return <WantedView />
    default:
      return <HomeView />
  }
}

export default function ViewRouter() {
  const activeView = useUIStore((s) => s.activeView)
  const lastView = useUIStore((s) => s.viewBackHistory[s.viewBackHistory.length - 1])
  const controllerEnabledView = activeView === 'home' || activeView === 'library' || activeView === 'stats' || activeView === 'playlist'

  // Settings floats over the page you came from, which stays visible (and inert) underneath.
  if (activeView === 'settings') {
    const underlay = lastView && lastView !== 'settings' ? lastView : 'library'
    return (
      <div className="app-view-transition-surface has-settings-overlay" data-controller-exclude="true">
        <div className="settings-underlay" aria-hidden="true" {...({ inert: '' } as Record<string, string>)}>
          {renderView(underlay)}
        </div>
        <div
          className="settings-overlay"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              const ui = useUIStore.getState()
              if (!ui.navigateViewBack()) ui.setActiveView('library')
            }
          }}
        >
          <SettingsView />
        </div>
      </div>
    )
  }

  return (
    <div
      className="app-view-transition-surface"
      data-controller-region={controllerEnabledView ? 'true' : undefined}
      data-controller-region-id={controllerEnabledView ? `view:${activeView}` : undefined}
      data-controller-exclude={controllerEnabledView ? undefined : 'true'}
    >
      {renderView(activeView)}
    </div>
  )
}

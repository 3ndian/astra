import type { HomeDashboard, HomeDashboardQuery } from '../../types/home'

interface DashboardRequest {
  query: HomeDashboardQuery
  resolve: (dashboard: HomeDashboard) => void
  reject: (error: unknown) => void
  canceled: boolean
}

/** Keep at most one IPC request running and only the latest refresh waiting. */
export function createHomeDashboardLoader(fetchDashboard: (query: HomeDashboardQuery) => Promise<HomeDashboard>) {
  let active: DashboardRequest | null = null
  let pending: DashboardRequest | null = null

  const drain = async (): Promise<void> => {
    if (active || !pending) return
    const request = pending
    pending = null
    active = request
    try {
      const dashboard = await fetchDashboard(request.query)
      if (!request.canceled) request.resolve(dashboard)
    } catch (error) {
      if (!request.canceled) request.reject(error)
    } finally {
      active = null
      void drain()
    }
  }

  return {
    request(query: HomeDashboardQuery, resolve: DashboardRequest['resolve'], reject: DashboardRequest['reject']): () => void {
      if (active) active.canceled = true
      if (pending) pending.canceled = true
      const request = { query, resolve, reject, canceled: false }
      pending = request
      // Collapse same-turn updates, including React's effect setup/cleanup cycle.
      queueMicrotask(() => { void drain() })
      return () => {
        request.canceled = true
        if (pending === request) pending = null
      }
    }
  }
}

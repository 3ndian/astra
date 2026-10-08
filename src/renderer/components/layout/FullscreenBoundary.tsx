import { Component, type ErrorInfo, type ReactNode } from 'react'
import { useUIStore } from '../../stores/uiStore'
import { useMilkdropStore } from '../../stores/milkdropStore'

interface State {
  hasError: boolean
}

/**
 * If anything in the fullscreen player throws, leave fullscreen instead of leaving the app
 * as a blank screen. Milkdrop is also turned off so the next open can't crash the same way.
 */
export default class FullscreenBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Fullscreen player crashed; closing it.', error, info.componentStack)
    try {
      useMilkdropStore.getState().setEnabled(false)
    } catch {
      // nothing else to do
    }
    useUIStore.getState().setFullscreen(false)
  }

  render(): ReactNode {
    return this.state.hasError ? null : this.props.children
  }
}

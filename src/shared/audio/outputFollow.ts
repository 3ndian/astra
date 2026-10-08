// Rules for following the system's default output (e.g. when AirPods connect) and for
// showing which device in a picker is the active one. Pure, no DOM.

export interface PickerDevice {
  deviceId: string
  isDefaultAlias: boolean
}

/** "System default" is stored as an empty id or Chromium's literal "default". */
export function followsSystemDefault(selectedDeviceId: string): boolean {
  const selected = selectedDeviceId.trim()
  return selected === '' || selected === 'default'
}

/**
 * True when the OS default output moved to a different physical device (AirPods connected or
 * disconnected). `before` and `after` are physical device ids; null means "unknown", in which
 * case we do nothing rather than guess.
 */
export function defaultRouteChanged(before: string | null, after: string | null): boolean {
  return Boolean(before) && Boolean(after) && before !== after
}

/** Re-point playback at the new default only when the user hasn't pinned a specific device. */
export function shouldRebindToDefault(selectedDeviceId: string, before: string | null, after: string | null): boolean {
  return followsSystemDefault(selectedDeviceId) && defaultRouteChanged(before, after)
}

export function isDeviceSelected(device: PickerDevice, selectedDeviceId: string): boolean {
  if (device.isDefaultAlias) return followsSystemDefault(selectedDeviceId)
  return device.deviceId === selectedDeviceId.trim()
}

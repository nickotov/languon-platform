export function isMacPlatform(): boolean {
  return typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
}

export function modKeyLabel(): string {
  return isMacPlatform() ? '⌘' : 'Ctrl'
}


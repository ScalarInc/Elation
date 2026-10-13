import { useEffect, useState } from 'react'

export type Theme = 'light' | 'dark'
/** What the person chose: a fixed theme, or follow the device. */
export type ThemeMode = Theme | 'system'
const STORAGE_KEY = 'elation.theme'
const CHANGED = 'elation:theme'

const prefersDark = () => typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches

function readMode(): ThemeMode {
  if (typeof window === 'undefined') return 'system'
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    return stored === 'light' || stored === 'dark' ? stored : 'system'
  } catch {
    return 'system'
  }
}

const resolve = (mode: ThemeMode): Theme => (mode === 'system' ? (prefersDark() ? 'dark' : 'light') : mode)

function apply(theme: Theme) {
  const root = document.documentElement
  root.classList.toggle('dark', theme === 'dark')
  root.style.colorScheme = theme
}

export function initTheme() {
  apply(resolve(readMode()))
}

function store(mode: ThemeMode) {
  try {
    if (mode === 'system') window.localStorage.removeItem(STORAGE_KEY)
    else window.localStorage.setItem(STORAGE_KEY, mode)
  } catch {
    // Private mode: the choice lasts for this page only.
  }
  // Every useTheme() on the page (header toggle, settings, toasts) follows along.
  window.dispatchEvent(new Event(CHANGED))
}

export function useTheme() {
  const [mode, setModeState] = useState<ThemeMode>(readMode)
  const [systemDark, setSystemDark] = useState(prefersDark)
  const theme: Theme = mode === 'system' ? (systemDark ? 'dark' : 'light') : mode

  useEffect(() => {
    apply(theme)
  }, [theme])

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const onMedia = () => setSystemDark(media.matches)
    const onChanged = () => setModeState(readMode())
    media.addEventListener('change', onMedia)
    window.addEventListener(CHANGED, onChanged)
    return () => {
      media.removeEventListener('change', onMedia)
      window.removeEventListener(CHANGED, onChanged)
    }
  }, [])

  const setMode = (next: ThemeMode) => {
    setModeState(next)
    store(next)
  }

  return {
    theme,
    mode,
    setMode,
    setTheme: (t: Theme) => setMode(t),
    toggle: () => setMode(theme === 'light' ? 'dark' : 'light'),
  }
}

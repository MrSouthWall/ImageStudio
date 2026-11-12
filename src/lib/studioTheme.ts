import { useLayoutEffect, useState } from 'react'

export type StudioTheme = 'light' | 'dark'
export type StudioAppearance = 'studio' | 'classic'

const appearanceKey = 'imagestudio-appearance'
const themeKeys = { studio: 'imagestudio-color-mode', classic: 'imagestudio-classic-color-mode' }

function readTheme(appearance: StudioAppearance): StudioTheme {
  try {
    const saved = localStorage.getItem(themeKeys[appearance])
    if (saved === 'light' || saved === 'dark') return saved
  } catch { /* 使用默认模式。 */ }
  return appearance === 'classic' ? 'light' : 'dark'
}

function savePreference(key: string, value: string) {
  try { localStorage.setItem(key, value) } catch { /* 本次会话仍然可以切换。 */ }
}

export function useStudioTheme() {
  const [appearance, updateAppearance] = useState<StudioAppearance>(() => document.documentElement.dataset.appearance === 'classic' ? 'classic' : 'studio')
  const [themes, updateThemes] = useState(() => ({ studio: readTheme('studio'), classic: readTheme('classic') }))
  const theme = themes[appearance]

  useLayoutEffect(() => {
    const root = document.documentElement
    root.dataset.appearance = appearance
    root.dataset.theme = theme
    const color = theme === 'dark' ? '#0c0c0c' : appearance === 'classic' ? '#ffffff' : '#f3f3f3'
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', color)
  }, [appearance, theme])

  function setAppearance(next: StudioAppearance) {
    updateAppearance(next)
    savePreference(appearanceKey, next)
  }

  function setTheme(next: StudioTheme) {
    updateThemes((current) => ({ ...current, [appearance]: next }))
    savePreference(themeKeys[appearance], next)
  }

  return { appearance, theme, setAppearance, setTheme }
}

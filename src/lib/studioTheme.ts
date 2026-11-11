import { useLayoutEffect, useState } from 'react'

type Theme = 'light' | 'dark'
const key = 'imagestudio-color-mode'

export function useStudioTheme() {
  const [theme, setTheme] = useState<Theme>(() => document.documentElement.dataset.theme === 'light' ? 'light' : 'dark')

  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#0c0c0c' : '#f3f3f3')
  }, [theme])

  function toggle() {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    try { localStorage.setItem(key, next) } catch { /* 本次会话仍然可以切换。 */ }
  }

  return { theme, toggle }
}

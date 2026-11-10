import type { FontMode } from '../types'

const FONT_MODES: FontMode[] = ['default', 'builtin', 'system', 'custom']

export function normalizeFontMode(value: unknown): FontMode {
  return FONT_MODES.includes(value as FontMode) ? value as FontMode : 'default'
}

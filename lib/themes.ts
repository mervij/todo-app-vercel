export type ColorTheme = {
  name: string
  primary: string
  dark: string
}

export const colorThemes: ColorTheme[] = [
  { name: 'Violet',  primary: 'oklch(62.7% 0.265 304)', dark: 'oklch(55%  0.265 304)' },
  { name: 'Indigo',  primary: 'oklch(57%  0.26  270)', dark: 'oklch(49%  0.26  270)' },
  { name: 'Blue',    primary: 'oklch(57%  0.25  250)', dark: 'oklch(49%  0.25  250)' },
  { name: 'Sky',     primary: 'oklch(62%  0.2   210)', dark: 'oklch(54%  0.2   210)' },
  { name: 'Teal',    primary: 'oklch(60%  0.2   185)', dark: 'oklch(52%  0.2   185)' },
  { name: 'Green',   primary: 'oklch(58%  0.22  145)', dark: 'oklch(50%  0.22  145)' },
  { name: 'Amber',   primary: 'oklch(65%  0.2    70)', dark: 'oklch(57%  0.2    70)' },
  { name: 'Orange',  primary: 'oklch(63%  0.22   45)', dark: 'oklch(55%  0.22   45)' },
  { name: 'Red',     primary: 'oklch(57%  0.22   25)', dark: 'oklch(49%  0.22   25)' },
  { name: 'Pink',    primary: 'oklch(62%  0.22  335)', dark: 'oklch(54%  0.22  335)' },
]

export const DEFAULT_THEME = colorThemes[0]
export const THEME_KEY = 'todo-color-theme'

export function applyTheme(theme: ColorTheme) {
  document.documentElement.style.setProperty('--color-primary', theme.primary)
  document.documentElement.style.setProperty('--color-primary-dark', theme.dark)
}

export function getSavedTheme(): ColorTheme {
  try {
    const raw = localStorage.getItem(THEME_KEY)
    if (raw) {
      const saved = JSON.parse(raw) as ColorTheme
      const match = colorThemes.find((t) => t.name === saved.name)
      return match ?? DEFAULT_THEME
    }
  } catch {}
  return DEFAULT_THEME
}

export function saveTheme(theme: ColorTheme) {
  localStorage.setItem(THEME_KEY, JSON.stringify(theme))
  applyTheme(theme)
}

export type ColorMode = 'light' | 'dark'
export const MODE_KEY = 'todo-color-mode'

export function applyMode(mode: ColorMode | null) {
  if (mode) document.documentElement.setAttribute('data-theme', mode)
  else document.documentElement.removeAttribute('data-theme')
}

// null means "follow the OS setting" (no explicit choice saved yet).
export function getSavedMode(): ColorMode | null {
  try {
    const raw = localStorage.getItem(MODE_KEY)
    if (raw === 'light' || raw === 'dark') return raw
  } catch {}
  return null
}

export function saveMode(mode: ColorMode) {
  localStorage.setItem(MODE_KEY, mode)
  applyMode(mode)
}

import type { Theme } from '../types'

/**
 * Applies the chosen theme. The inline script in index.html stamps the same
 * attribute before first paint from localStorage, so this only has to keep
 * the two in step when the setting changes.
 */
export function applyTheme(theme: Theme) {
  const root = document.documentElement
  const dark = theme === 'dark' || (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches)
  if (theme === 'system') delete root.dataset.theme
  else root.dataset.theme = theme
  document.querySelectorAll('meta[name="theme-color"]').forEach(m => {
    if (theme !== 'system') m.setAttribute('content', dark ? '#121316' : '#faf9f6')
    else m.setAttribute('content', m.getAttribute('media')?.includes('dark') ? '#121316' : '#faf9f6')
  })
  try {
    localStorage.setItem('fusellm:theme', theme)
  } catch {
    /* storage blocked */
  }
}

/** stream-monaco registers vitesse-* by default; github-* are not bundled unless explicitly loaded. */
export const CODE_BLOCK_MONACO_THEMES = ['vitesse-dark', 'vitesse-light']

export const CODE_BLOCK_THEME = {
  light: 'vitesse-light',
  dark: 'vitesse-dark'
}

export const CODE_BLOCK_PROPS = {
  theme: CODE_BLOCK_THEME,
  themes: CODE_BLOCK_MONACO_THEMES
}

// apps/frontend/tailwind.config.ts
import type { Config } from 'tailwindcss'
export default {
  content: ['components/**/*.vue','pages/**/*.vue','composables/**/*.ts','stores/**/*.ts'],
  theme: {
    extend: {
      colors: {
        bg:             'var(--color-bg)',
        surface:        'var(--color-surface)',
        'surface-2':    'var(--color-surface-2)',
        'surface-offset':'var(--color-surface-offset)',
        border:         'var(--color-border)',
        text:           'var(--color-text)',
        muted:          'var(--color-text-muted)',
        error:          'var(--color-error)',
        primary:        'var(--color-primary)',
      }
    }
  }
} satisfies Config

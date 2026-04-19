// packages/types/src/widget.ts
export interface WidgetLayout {
  i:        string
  type:     string
  x:        number
  y:        number
  w:        number
  h:        number
  visible:  boolean
  settings?: Record<string, unknown>
}

export interface DashboardLayout {
  id:        string
  name:      string
  updatedAt: number
  breakpoints: {
    lg: WidgetLayout[]
    md: WidgetLayout[]
    sm: WidgetLayout[]
  }
  globalSettings: {
    theme:    'dark' | 'light'
    currency: string
  }
}

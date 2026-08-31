'use client'

import { useEffect } from 'react'
import { getSavedTheme, applyTheme, getSavedMode, applyMode } from '@/lib/themes'

export default function ThemeLoader() {
  useEffect(() => {
    applyTheme(getSavedTheme())
    applyMode(getSavedMode())
  }, [])
  return null
}

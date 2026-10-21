import { useEffect, useState } from 'react'

export type LayoutMode = 'mobile' | 'tablet' | 'desktop'

/**
 * mobile  < 768px  → header + drawer
 * tablet  768–1023 → icon rail; expanding opens the drawer as an overlay
 * desktop ≥ 1024  → user preference (expanded or collapsed)
 * `wide` (≥ 1280) tells the shell whether editor + AI panel + expanded sidebar fit together.
 */
export function useLayoutMode() {
  const [width, setWidth] = useState(() => window.innerWidth)

  useEffect(() => {
    let frame = 0
    const onResize = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => setWidth(window.innerWidth))
    }
    window.addEventListener('resize', onResize)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', onResize)
    }
  }, [])

  const mode: LayoutMode = width < 768 ? 'mobile' : width < 1024 ? 'tablet' : 'desktop'
  return { mode, wide: width >= 1280 }
}


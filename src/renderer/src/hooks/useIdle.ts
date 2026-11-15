import { useEffect, useState } from 'react'

/**
 * @deprecated 查看器已改用 immersive / slideIdle / peekY 三状态源（见 lib/chromeVisibility.ts）。
 * 保留文件避免与其它分支冲突；新代码不要再用「全局 idle 计时器」控制 chrome。
 */
export function useIdle(delay = 2000): boolean {
  const [idle, setIdle] = useState(false)

  useEffect(() => {
    let timer: number | null = null

    const wake = (): void => {
      setIdle(false)
      if (timer !== null) window.clearTimeout(timer)
      timer = window.setTimeout(() => setIdle(true), delay)
    }

    wake()
    window.addEventListener('pointermove', wake, { passive: true })
    window.addEventListener('pointerdown', wake, { passive: true })
    window.addEventListener('keydown', wake)
    return () => {
      if (timer !== null) window.clearTimeout(timer)
      window.removeEventListener('pointermove', wake)
      window.removeEventListener('pointerdown', wake)
      window.removeEventListener('keydown', wake)
    }
  }, [delay])

  return idle
}

import { useEffect, useState } from 'react'

/**
 * 指针和键盘静止 delay 毫秒后返回 true；任何输入立即回到 false。
 * 用于灯箱、视频播放器这类「看的时候不该有控件」的场景。
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

'use client'

import { useEffect, useState } from 'react'
import { ArrowUpIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'

const SCROLL_THRESHOLD = 400

// 문서(window) 스크롤을 기준으로 판단한다 — SidebarInset(main)에는 별도
// overflow-auto가 없어 실제로는 창 전체가 스크롤되는 구조이기 때문이다.
export function ScrollToTopButton() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    function handleScroll() {
      setVisible(window.scrollY > SCROLL_THRESHOLD)
    }
    handleScroll()
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  if (!visible) return null

  return (
    <Button
      type="button"
      size="icon"
      aria-label="맨 위로 이동"
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      className="fixed right-6 bottom-6 z-50 size-10 rounded-full shadow-lg"
    >
      <ArrowUpIcon />
    </Button>
  )
}

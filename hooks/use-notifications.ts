'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

export interface NotificationItem {
  id: number
  type: string
  message: string
  read: boolean
  createdAt: string
}

interface NotificationState {
  unreadCount: number
  items: NotificationItem[]
}

export function useNotifications() {
  const [state, setState] = useState<NotificationState>({ unreadCount: 0, items: [] })
  const esRef = useRef<EventSource | null>(null)

  const prevItemsRef = useRef<NotificationItem[]>([])

  const connect = useCallback(() => {
    if (esRef.current) {
      esRef.current.close()
      esRef.current = null
    }

    const es = new EventSource('/api/notifications/stream')
    esRef.current = es

    es.addEventListener('notifications', (e) => {
      try {
        const data = JSON.parse(e.data) as NotificationState
        const prevIds = new Set(prevItemsRef.current.map((i) => i.id))
        const newItems = data.items.filter((i) => !prevIds.has(i.id))
        prevItemsRef.current = data.items

        setState(data)

        if (typeof window !== 'undefined' && newItems.length > 0) {
          window.dispatchEvent(
            new CustomEvent('app:notification-received', {
              detail: { newItems, state: data },
            })
          )
        }
      } catch {
        // 파싱 실패는 무시
      }
    })

    es.onerror = () => {
      es.close()
      esRef.current = null
      // 5초 후 재연결 시도
      setTimeout(connect, 5000)
    }
  }, [])

  useEffect(() => {
    connect()

    // 탭 비활성화 시 SSE 연결 끊기, 활성화 시 재연결
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        connect()
      } else {
        esRef.current?.close()
        esRef.current = null
      }
    }

    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility)
      esRef.current?.close()
      esRef.current = null
    }
  }, [connect])

  const markAsRead = useCallback(async (id: number) => {
    // 낙관적 UI 업데이트 — 요청 결과와 무관하게 즉시 읽음 처리
    setState((prev) => {
      const target = prev.items.find((i) => i.id === id && !i.read)
      return {
        unreadCount: target ? Math.max(0, prev.unreadCount - 1) : prev.unreadCount,
        items: prev.items.map((item) => (item.id === id ? { ...item, read: true } : item)),
      }
    })
    try {
      await fetch(`/api/notifications/${id}/read`, { method: 'PATCH' })
    } catch {
      // 실패해도 다음 SSE 이벤트에서 서버 상태로 동기화됨
    }
  }, [])

  const markAllAsRead = useCallback(async () => {
    setState((prev) => ({
      unreadCount: 0,
      items: prev.items.map((item) => ({ ...item, read: true })),
    }))
    try {
      await fetch('/api/notifications/read-all', { method: 'PATCH' })
    } catch {
      // 실패해도 다음 SSE 이벤트에서 서버 상태로 동기화됨
    }
  }, [])

  return { ...state, markAsRead, markAllAsRead }
}

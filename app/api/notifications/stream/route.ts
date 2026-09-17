import { NextRequest } from 'next/server'
import { requireApprovedUser } from '@/lib/auth/session'
import { getNotifications, getUnreadCount } from '@/lib/db/notifications'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  let userId: number
  try {
    const session = await requireApprovedUser()
    userId = Number((session.user as { id?: string }).id)
    if (!userId) throw new Error()
  } catch {
    return new Response('Unauthorized', { status: 401 })
  }

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false

      const send = (data: object) => {
        if (closed) return
        controller.enqueue(
          encoder.encode(`event: notifications\ndata: ${JSON.stringify(data)}\n\n`)
        )
      }

      const keepalive = () => {
        if (closed) return
        controller.enqueue(encoder.encode(': keepalive\n\n'))
      }

      const cleanup = () => {
        closed = true
        clearInterval(pollInterval)
        clearInterval(keepaliveInterval)
        try { controller.close() } catch { /* 이미 닫힌 경우 무시 */ }
      }

      req.signal.addEventListener('abort', cleanup)

      // 연결 직후 1회 즉시 전송
      try {
        const [items, unreadCount] = await Promise.all([
          getNotifications(userId),
          getUnreadCount(userId),
        ])
        send({ unreadCount, items })
      } catch {
        // 첫 쿼리 실패는 무시하고 폴링 루프에서 재시도
      }

      // 3초 폴링 루프
      const pollInterval = setInterval(async () => {
        if (closed || req.signal.aborted) {
          cleanup()
          return
        }
        try {
          const [items, unreadCount] = await Promise.all([
            getNotifications(userId),
            getUnreadCount(userId),
          ])
          send({ unreadCount, items })
        } catch {
          // DB 오류는 무시하고 다음 폴링에서 재시도
        }
      }, 3000)

      // Vercel 타임아웃(최대 25초) 대응: 20초마다 keepalive 코멘트 전송
      const keepaliveInterval = setInterval(keepalive, 20000)
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  })
}

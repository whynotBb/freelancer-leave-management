import { NextRequest, NextResponse } from 'next/server'
import { requireApprovedUser, toAuthErrorResponse } from '@/lib/auth/session'
import { markAsRead } from '@/lib/db/notifications'

export async function PATCH(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireApprovedUser()
    const userId = Number((session.user as { id?: string }).id)
    if (!userId) return NextResponse.json({ error: '인증 오류' }, { status: 401 })

    const { id } = await params
    const notificationId = Number(id)
    if (isNaN(notificationId)) {
      return NextResponse.json({ error: '잘못된 요청' }, { status: 400 })
    }

    const updated = await markAsRead(notificationId, userId)
    if (!updated) {
      return NextResponse.json({ error: '대상을 찾을 수 없습니다.' }, { status: 404 })
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    const response = toAuthErrorResponse(error)
    if (response) return response
    throw error
  }
}

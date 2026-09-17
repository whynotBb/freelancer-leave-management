import { NextResponse } from 'next/server'
import { requireApprovedUser, toAuthErrorResponse } from '@/lib/auth/session'
import { markAllAsRead } from '@/lib/db/notifications'

export async function PATCH() {
  try {
    const session = await requireApprovedUser()
    const userId = Number((session.user as { id?: string }).id)
    if (!userId) return NextResponse.json({ error: '인증 오류' }, { status: 401 })

    const updatedCount = await markAllAsRead(userId)
    return NextResponse.json({ ok: true, updatedCount })
  } catch (error) {
    const response = toAuthErrorResponse(error)
    if (response) return response
    throw error
  }
}

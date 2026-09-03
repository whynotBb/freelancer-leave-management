import { NextResponse } from 'next/server'
import { requireSuperAdmin, toAuthErrorResponse } from '@/lib/auth/session'
import { deleteHoliday } from '@/lib/db/holidays'

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireSuperAdmin()
    const { id } = await params
    const deleted = await deleteHoliday(Number(id))
    if (!deleted) {
      return NextResponse.json({ error: '대상을 찾을 수 없습니다.' }, { status: 404 })
    }
    return NextResponse.json({ ok: true })
  } catch (error) {
    const response = toAuthErrorResponse(error)
    if (response) return response
    throw error
  }
}

import { NextResponse } from 'next/server'
import { requireApproverOrAbove, toAuthErrorResponse } from '@/lib/auth/session'
import { getUserHistory } from '@/lib/db/user-history'

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireApproverOrAbove()
    const { id } = await params
    const targetId = Number(id)
    if (!Number.isInteger(targetId)) {
      return NextResponse.json({ error: '대상을 찾을 수 없습니다.' }, { status: 404 })
    }
    const history = await getUserHistory(targetId)
    return NextResponse.json(history)
  } catch (error) {
    const response = toAuthErrorResponse(error)
    if (response) return response
    throw error
  }
}

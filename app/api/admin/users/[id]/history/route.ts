import { NextResponse } from 'next/server'
import { requireApproverOrAbove, toAuthErrorResponse } from '@/lib/auth/session'
import { getUserHistory } from '@/lib/db/user-history'

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireApproverOrAbove()
    const { id } = await params
    const history = await getUserHistory(Number(id))
    return NextResponse.json(history)
  } catch (error) {
    const response = toAuthErrorResponse(error)
    if (response) return response
    throw error
  }
}

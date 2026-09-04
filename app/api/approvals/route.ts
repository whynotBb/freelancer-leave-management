import { NextResponse } from 'next/server'
import { requireApproverOrAbove, toAuthErrorResponse } from '@/lib/auth/session'
import { getApprovalQueue } from '@/lib/db/leave-requests'

export async function GET() {
  try {
    const session = await requireApproverOrAbove()
    const approverId = Number((session.user as { id?: string }).id)
    const queue = await getApprovalQueue(approverId)
    return NextResponse.json(queue)
  } catch (error) {
    const response = toAuthErrorResponse(error)
    if (response) return response
    throw error
  }
}

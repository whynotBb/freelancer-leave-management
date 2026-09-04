import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireApproverOrAbove, toAuthErrorResponse } from '@/lib/auth/session'
import { transitionLeaveRequestAsApprover } from '@/lib/db/leave-requests'
import { createNotification } from '@/lib/db/notifications'

const bodySchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('approve') }),
  z.object({ action: z.literal('reject'), rejectReason: z.string().min(1) }),
])

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireApproverOrAbove()
    const approverId = Number((session.user as { id?: string }).id)
    const { id } = await params
    const requestId = Number(id)
    if (!Number.isInteger(requestId)) {
      return NextResponse.json({ error: '대상을 찾을 수 없습니다.' }, { status: 404 })
    }

    let rawBody: unknown
    try {
      rawBody = await request.json()
    } catch {
      return NextResponse.json({ error: '입력값이 올바르지 않습니다.' }, { status: 400 })
    }
    const parsed = bodySchema.safeParse(rawBody)
    if (!parsed.success) {
      return NextResponse.json({ error: '입력값이 올바르지 않습니다.' }, { status: 400 })
    }
    const body = parsed.data

    try {
      const result = await transitionLeaveRequestAsApprover(
        requestId,
        approverId,
        body.action === 'approve' ? 'APPROVE' : 'REJECT',
        body.action === 'reject' ? body.rejectReason : undefined
      )
      if (!result) {
        return NextResponse.json({ error: '대상을 찾을 수 없습니다.' }, { status: 404 })
      }
      await createNotification({
        recipientId: result.userId,
        type: body.action === 'approve' ? 'LEAVE_APPROVED' : 'LEAVE_REJECTED',
        refId: requestId,
        message:
          body.action === 'approve'
            ? `"${result.title}" 신청이 승인되었습니다.`
            : `"${result.title}" 신청이 반려되었습니다: ${body.rejectReason}`,
      })
      return NextResponse.json({ ok: true, status: result.status })
    } catch (error) {
      const message = error instanceof Error ? error.message : '처리할 수 없습니다.'
      return NextResponse.json({ error: message }, { status: 400 })
    }
  } catch (error) {
    const response = toAuthErrorResponse(error)
    if (response) return response
    throw error
  }
}

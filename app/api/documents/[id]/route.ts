import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/lib/db/client'
import { users } from '@/lib/db/schema'
import { requireFreelancer, toAuthErrorResponse } from '@/lib/auth/session'
import { getHolidayDates } from '@/lib/db/holidays'
import { calculateRequestedDays } from '@/lib/domain/leave-day-count'
import {
  checkSubmissionEligibility,
  deleteDraftLeaveRequest,
  transitionOwnLeaveRequest,
  updateDraftLeaveRequest,
} from '@/lib/db/leave-requests'

const editFieldsSchema = z.object({
  title: z.string().min(1),
  approverId: z.number(),
  startDate: z.string(),
  endDate: z.string(),
  type: z.enum(['FULL', 'AM_HALF', 'PM_HALF']),
  reason: z.string().min(1),
})

const patchSchema = z.discriminatedUnion('action', [
  editFieldsSchema.extend({ action: z.literal('save') }),
  editFieldsSchema.extend({ action: z.literal('submit') }),
  z.object({ action: z.literal('cancel') }),
])

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireFreelancer()
    const userId = Number((session.user as { id?: string }).id)
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
    const parsed = patchSchema.safeParse(rawBody)
    if (!parsed.success) {
      return NextResponse.json({ error: '입력값이 올바르지 않습니다.' }, { status: 400 })
    }
    const body = parsed.data

    if (body.action === 'cancel') {
      try {
        const result = await transitionOwnLeaveRequest(requestId, userId, 'CANCEL')
        if (!result) {
          return NextResponse.json({ error: '대상을 찾을 수 없습니다.' }, { status: 404 })
        }
        return NextResponse.json({ ok: true, status: result.status })
      } catch (error) {
        const message = error instanceof Error ? error.message : '처리할 수 없습니다.'
        return NextResponse.json({ error: message }, { status: 400 })
      }
    }

    if (body.type !== 'FULL' && body.startDate !== body.endDate) {
      return NextResponse.json({ error: '반차는 시작일과 종료일이 같아야 합니다.' }, { status: 400 })
    }

    const [approver] = await db.select().from(users).where(eq(users.id, body.approverId))
    if (!approver || (approver.role !== 'APPROVER' && approver.role !== 'SUPER_ADMIN')) {
      return NextResponse.json({ error: '유효하지 않은 결재자입니다.' }, { status: 400 })
    }

    const holidayDates = await getHolidayDates()
    const requestedDays = calculateRequestedDays(body.startDate, body.endDate, body.type, holidayDates)

    const updated = await updateDraftLeaveRequest(requestId, userId, {
      title: body.title,
      approverId: body.approverId,
      startDate: body.startDate,
      endDate: body.endDate,
      type: body.type,
      requestedDays,
      reason: body.reason,
    })
    if (!updated) {
      return NextResponse.json({ error: '대상을 찾을 수 없습니다.' }, { status: 404 })
    }

    if (body.action === 'save') {
      return NextResponse.json({ ok: true, status: 'DRAFT', requestedDays })
    }

    const eligibility = await checkSubmissionEligibility(userId, body.startDate, body.endDate, requestedDays)
    if (!eligibility.ok) {
      return NextResponse.json({ error: eligibility.error }, { status: 400 })
    }
    try {
      const result = await transitionOwnLeaveRequest(requestId, userId, 'SUBMIT')
      if (!result) {
        return NextResponse.json({ error: '대상을 찾을 수 없습니다.' }, { status: 404 })
      }
      return NextResponse.json({
        ok: true,
        status: result.status,
        requestedDays,
        overlapWarning: eligibility.overlapWarning,
      })
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

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireFreelancer()
    const userId = Number((session.user as { id?: string }).id)
    const { id } = await params
    const requestId = Number(id)
    if (!Number.isInteger(requestId)) {
      return NextResponse.json({ error: '대상을 찾을 수 없습니다.' }, { status: 404 })
    }

    const deleted = await deleteDraftLeaveRequest(requestId, userId)
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

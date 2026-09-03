import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireFreelancer, toAuthErrorResponse } from '@/lib/auth/session'
import { getHolidayDates } from '@/lib/db/holidays'
import {
  checkSubmissionEligibility,
  createLeaveRequest,
  getMyDocumentSummary,
  getMyDocumentTimeline,
} from '@/lib/db/leave-requests'
import { findAssignableApprover } from '@/lib/db/approvers'
import { calculateRequestedDays } from '@/lib/domain/leave-day-count'

export async function GET() {
  try {
    const session = await requireFreelancer()
    const userId = Number((session.user as { id?: string }).id)

    const [summary, timeline, holidayDates] = await Promise.all([
      getMyDocumentSummary(userId),
      getMyDocumentTimeline(userId),
      getHolidayDates(),
    ])

    return NextResponse.json({ summary, timeline, holidayDates: [...holidayDates] })
  } catch (error) {
    const response = toAuthErrorResponse(error)
    if (response) return response
    throw error
  }
}

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/

const bodySchema = z
  .object({
    action: z.enum(['save', 'submit']),
    title: z.string().min(1),
    approverId: z.number(),
    startDate: z.string().regex(DATE_REGEX, '날짜 형식이 올바르지 않습니다.'),
    endDate: z.string().regex(DATE_REGEX, '날짜 형식이 올바르지 않습니다.'),
    type: z.enum(['FULL', 'AM_HALF', 'PM_HALF']),
    reason: z.string().min(1),
  })
  .refine((body) => body.startDate <= body.endDate, {
    message: '종료일이 시작일보다 이릅니다.',
    path: ['endDate'],
  })

export async function POST(request: Request) {
  try {
    const session = await requireFreelancer()
    const userId = Number((session.user as { id?: string }).id)

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

    if (body.type !== 'FULL' && body.startDate !== body.endDate) {
      return NextResponse.json({ error: '반차는 시작일과 종료일이 같아야 합니다.' }, { status: 400 })
    }

    const approver = await findAssignableApprover(body.approverId)
    if (!approver) {
      return NextResponse.json({ error: '유효하지 않은 결재자입니다.' }, { status: 400 })
    }

    const holidayDates = await getHolidayDates()
    const requestedDays = calculateRequestedDays(body.startDate, body.endDate, body.type, holidayDates)

    if (body.action === 'submit') {
      const eligibility = await checkSubmissionEligibility(userId, body.startDate, body.endDate, body.type, requestedDays)
      if (!eligibility.ok) {
        return NextResponse.json({ error: eligibility.error }, { status: 400 })
      }
    }

    const created = await createLeaveRequest(
      userId,
      {
        title: body.title,
        approverId: body.approverId,
        startDate: body.startDate,
        endDate: body.endDate,
        type: body.type,
        requestedDays,
        reason: body.reason,
      },
      body.action === 'submit' ? 'PENDING' : 'DRAFT'
    )

    return NextResponse.json({ ok: true, id: created.id, requestedDays })
  } catch (error) {
    const response = toAuthErrorResponse(error)
    if (response) return response
    throw error
  }
}

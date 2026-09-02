import { NextResponse } from 'next/server'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { requireFreelancer, toAuthErrorResponse } from '@/lib/auth/session'
import { getHolidayDates } from '@/lib/db/holidays'
import {
  checkSubmissionEligibility,
  createLeaveRequest,
  getMyDocumentSummary,
  getMyDocumentTimeline,
} from '@/lib/db/leave-requests'
import { db } from '@/lib/db/client'
import { users } from '@/lib/db/schema'
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

const bodySchema = z.object({
  action: z.enum(['save', 'submit']),
  title: z.string().min(1),
  approverId: z.number(),
  startDate: z.string(),
  endDate: z.string(),
  type: z.enum(['FULL', 'AM_HALF', 'PM_HALF']),
  reason: z.string().min(1),
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

    const [approver] = await db.select().from(users).where(eq(users.id, body.approverId))
    if (!approver || (approver.role !== 'APPROVER' && approver.role !== 'SUPER_ADMIN')) {
      return NextResponse.json({ error: '유효하지 않은 결재자입니다.' }, { status: 400 })
    }

    const holidayDates = await getHolidayDates()
    const requestedDays = calculateRequestedDays(body.startDate, body.endDate, body.type, holidayDates)

    let overlapWarning = false
    if (body.action === 'submit') {
      const eligibility = await checkSubmissionEligibility(userId, body.startDate, body.endDate, requestedDays)
      if (!eligibility.ok) {
        return NextResponse.json({ error: eligibility.error }, { status: 400 })
      }
      overlapWarning = eligibility.overlapWarning
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

    return NextResponse.json({ ok: true, id: created.id, requestedDays, overlapWarning })
  } catch (error) {
    const response = toAuthErrorResponse(error)
    if (response) return response
    throw error
  }
}

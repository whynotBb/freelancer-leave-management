import { NextResponse } from 'next/server'
import { requireFreelancer, toAuthErrorResponse } from '@/lib/auth/session'
import { getHolidayDates } from '@/lib/db/holidays'
import { getMyDocumentSummary, getMyDocumentTimeline } from '@/lib/db/leave-requests'

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

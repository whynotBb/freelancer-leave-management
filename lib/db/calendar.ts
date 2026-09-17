import { and, eq, gte, lte, ne } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { db } from '@/lib/db/client'
import { holidays, leaveRequests, users } from '@/lib/db/schema'

export interface CalendarEventRow {
  id: number
  title: string
  requesterId: number
  requesterName: string
  type: 'FULL' | 'AM_HALF' | 'PM_HALF'
  startDate: string
  endDate: string
  requestedDays: number
  reason: string
  isMine: boolean
}

export interface CalendarHolidayRow {
  id: number
  date: string
  name: string
  isRecurring: boolean
}

export async function getCalendarData(
  userId: number,
  role: string,
  year: number,
  month: number
): Promise<{ events: CalendarEventRow[]; holidays: CalendarHolidayRow[] }> {
  // 월 시작일과 종료일 계산 (이월 대비 전후 10일 버퍼 포함)
  const pad = (n: number) => String(n).padStart(2, '0')
  const prevMonth = month === 1 ? 12 : month - 1
  const prevYear = month === 1 ? year - 1 : year
  const nextMonth = month === 12 ? 1 : month + 1
  const nextYear = month === 12 ? year + 1 : year

  const monthStart = `${prevYear}-${pad(prevMonth)}-20`
  const monthEnd = `${nextYear}-${pad(nextMonth)}-10`

  // 1. 공휴일 조회
  const holidayQuery = db
    .select({
      id: holidays.id,
      date: holidays.date,
      name: holidays.name,
      isRecurring: holidays.isRecurring,
    })
    .from(holidays)
    .where(and(gte(holidays.date, monthStart), lte(holidays.date, monthEnd)))

  // 2. 승인된 휴가 조회
  // - SUPER_ADMIN / APPROVER: 전체 승인된 휴가 조회
  // - FREELANCER: 본인 승인된 휴가만 조회
  const requester = alias(users, 'requester')
  const scopeCondition = role === 'FREELANCER' ? eq(leaveRequests.userId, userId) : undefined

  const requestQuery = db
    .select({
      id: leaveRequests.id,
      title: leaveRequests.title,
      requesterId: requester.id,
      requesterName: requester.name,
      type: leaveRequests.type,
      startDate: leaveRequests.startDate,
      endDate: leaveRequests.endDate,
      requestedDays: leaveRequests.requestedDays,
      reason: leaveRequests.reason,
    })
    .from(leaveRequests)
    .innerJoin(requester, eq(leaveRequests.userId, requester.id))
    .where(
      and(
        eq(leaveRequests.status, 'APPROVED'),
        ne(leaveRequests.type, 'ADJUSTMENT'),
        lte(leaveRequests.startDate, monthEnd),
        gte(leaveRequests.endDate, monthStart),
        scopeCondition
      )
    )

  const [holidayRows, requestRows] = await Promise.all([holidayQuery, requestQuery])

  const events: CalendarEventRow[] = requestRows.map((r) => ({
    id: r.id,
    title: r.title,
    requesterId: r.requesterId,
    requesterName: r.requesterName,
    type: r.type as 'FULL' | 'AM_HALF' | 'PM_HALF',
    startDate: r.startDate,
    endDate: r.endDate,
    requestedDays: Number(r.requestedDays),
    reason: r.reason,
    isMine: r.requesterId === userId,
  }))

  return {
    events,
    holidays: holidayRows,
  }
}

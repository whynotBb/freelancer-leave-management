import { eachDayOfInterval, parseISO } from 'date-fns'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { holidays } from '@/lib/db/schema'
import { expandHolidayDates, HOLIDAY_PROJECTION_YEARS_AFTER } from '@/lib/domain/holidays'
import { toISODate } from '@/lib/domain/date-utils'
import { isUniqueViolation } from '@/lib/db/postgres-errors'

export async function getHolidayDates(): Promise<Set<string>> {
  const rows = await db
    .select({ date: holidays.date, name: holidays.name, isRecurring: holidays.isRecurring })
    .from(holidays)
  const currentYear = new Date().getFullYear()
  return expandHolidayDates(rows, currentYear, 1, HOLIDAY_PROJECTION_YEARS_AFTER)
}

export interface HolidayListItem {
  id: number
  date: string
  name: string
  isRecurring: boolean
}

export async function listHolidays(): Promise<HolidayListItem[]> {
  return db.select().from(holidays).orderBy(holidays.date)
}

// 설날·추석 연휴처럼 여러 날짜에 걸친 공휴일도 화면에서는 기간 하나로 등록하지만, 저장은
// 하루당 한 행씩 한다(각 행을 독립적으로 삭제할 수 있어야 하고, 스키마에 기간 개념을 새로
// 두지 않기 위함). 여러 행을 하나의 INSERT 문으로 넣어, 기간 중 한 날짜라도 이미 등록되어
// 있으면(unique 위반) 전체가 부분 반영 없이 한꺼번에 실패하도록 한다.
export async function createHolidays(params: {
  startDate: string
  endDate: string
  name: string
  isRecurring: boolean
}): Promise<{ ok: true } | { error: string }> {
  const dates = eachDayOfInterval({ start: parseISO(params.startDate), end: parseISO(params.endDate) }).map(
    toISODate
  )
  try {
    await db.insert(holidays).values(
      dates.map((date) => ({ date, name: params.name, isRecurring: params.isRecurring }))
    )
    return { ok: true }
  } catch (error) {
    if (isUniqueViolation(error)) {
      return { error: '선택한 기간에 이미 등록된 날짜가 포함되어 있습니다.' }
    }
    throw error
  }
}

export async function deleteHoliday(id: number): Promise<boolean> {
  const rows = await db.delete(holidays).where(eq(holidays.id, id)).returning({ id: holidays.id })
  return rows.length > 0
}

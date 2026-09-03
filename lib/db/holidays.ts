import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { holidays } from '@/lib/db/schema'
import { expandHolidayDates, HOLIDAY_PROJECTION_YEARS_AFTER } from '@/lib/domain/holidays'
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

export async function createHoliday(params: {
  date: string
  name: string
  isRecurring: boolean
}): Promise<{ ok: true; id: number } | { error: string }> {
  try {
    const [row] = await db.insert(holidays).values(params).returning({ id: holidays.id })
    return { ok: true, id: row.id }
  } catch (error) {
    if (isUniqueViolation(error)) {
      return { error: '이미 등록된 날짜입니다.' }
    }
    throw error
  }
}

export async function deleteHoliday(id: number): Promise<boolean> {
  const rows = await db.delete(holidays).where(eq(holidays.id, id)).returning({ id: holidays.id })
  return rows.length > 0
}

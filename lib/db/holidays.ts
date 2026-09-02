import { db } from '@/lib/db/client'
import { holidays } from '@/lib/db/schema'

export async function getHolidayDates(): Promise<Set<string>> {
  const rows = await db.select({ date: holidays.date }).from(holidays)
  return new Set(rows.map((r) => r.date))
}

import { parseISO } from 'date-fns'
import { toISODate } from './date-utils'

// 공휴일 등록 화면(달력 상한)과 getHolidayDates()의 투영 범위가 서로 다른 값이 되면 등록한
// 날짜가 실제로는 적용되지 않는 조용한 버그가 생긴다 — 두 곳 모두 이 상수 하나를 쓴다.
export const HOLIDAY_PROJECTION_YEARS_AFTER = 2

export interface HolidayRow {
  date: string
  name: string
  isRecurring: boolean
}

// 반복 공휴일의 월/일을 [asOfYear - yearsBefore, asOfYear + yearsAfter] 범위의 매 연도에
// 투영한다. 2월 29일처럼 대상 연도에 존재하지 않는 날짜는 그 연도만 건너뛴다(3/1 등으로
// 보정하지 않음) — new Date(year, month, day)가 오버플로우되면 getMonth()가 원래 month와
// 달라지는 것으로 감지한다.
export function expandHolidayDates(
  rows: HolidayRow[],
  asOfYear: number,
  yearsBefore: number,
  yearsAfter: number
): Set<string> {
  const result = new Set<string>()
  for (const row of rows) {
    if (!row.isRecurring) {
      result.add(row.date)
      continue
    }
    const original = parseISO(row.date)
    const month = original.getMonth()
    const day = original.getDate()
    for (let year = asOfYear - yearsBefore; year <= asOfYear + yearsAfter; year++) {
      const projected = new Date(year, month, day)
      if (projected.getMonth() !== month) continue
      result.add(toISODate(projected))
    }
  }
  return result
}

import { eachDayOfInterval, isWeekend, parseISO } from 'date-fns'
import { toISODate } from './date-utils'

export type LeaveType = 'FULL' | 'AM_HALF' | 'PM_HALF'

export function calculateRequestedDays(
  startDate: string,
  endDate: string,
  type: LeaveType,
  holidayDates: Set<string>
): number {
  if (type !== 'FULL') {
    if (startDate !== endDate) {
      throw new Error('반차는 시작일과 종료일이 같아야 합니다.')
    }
    return isBusinessDay(startDate, holidayDates) ? 0.5 : 0
  }

  const days = eachDayOfInterval({ start: parseISO(startDate), end: parseISO(endDate) })
  return days.filter((d) => !isWeekend(d) && !holidayDates.has(toISODate(d))).length
}

function isBusinessDay(dateStr: string, holidayDates: Set<string>): boolean {
  return !isWeekend(parseISO(dateStr)) && !holidayDates.has(dateStr)
}

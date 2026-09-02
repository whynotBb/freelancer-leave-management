import { addMonths, differenceInCalendarYears, format, isBefore, isEqual, parseISO, startOfDay } from 'date-fns'

export function toISODate(date: Date): string {
  return format(date, 'yyyy-MM-dd')
}

export function addMonthsISO(dateStr: string, months: number): string {
  return toISODate(addMonths(parseISO(dateStr), months))
}

export function isBeforeDate(a: string, b: string): boolean {
  return isBefore(startOfDay(parseISO(a)), startOfDay(parseISO(b)))
}

export function isOnOrAfterDate(a: string, b: string): boolean {
  const da = startOfDay(parseISO(a))
  const db = startOfDay(parseISO(b))
  return isEqual(da, db) || isBefore(db, da)
}

export function getYearsOfService(hireDate: string, asOfDate: string): number {
  return differenceInCalendarYears(parseISO(asOfDate), parseISO(hireDate)) + 1
}

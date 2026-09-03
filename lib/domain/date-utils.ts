import { addMonths, differenceInMonths, format, isBefore, isEqual, parseISO, startOfDay } from 'date-fns'
import { getCurrentCycle } from './leave-cycle'

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
  return getCurrentCycle(hireDate, asOfDate).cycleIndex + 1
}

// 프리랜서는 장기 근속이 드물어 '근속 연차' 대신 만 개월 수(근무기간)로 노출한다.
// getYearsOfService(사이클 기준)와 달리 입사일 기준 만 개월 수를 그대로 절삭해 계산한다.
export function getMonthsOfService(hireDate: string, asOfDate: string): number {
  return differenceInMonths(parseISO(asOfDate), parseISO(hireDate))
}

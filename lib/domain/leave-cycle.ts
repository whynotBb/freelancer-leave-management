import { differenceInCalendarMonths, parseISO } from 'date-fns'
import { addMonthsISO, isOnOrAfterDate } from './date-utils'

export interface LeaveCycle {
  cycleIndex: number
  start: string
  end: string
}

export function getCurrentCycle(hireDate: string, asOfDate: string): LeaveCycle {
  let cycleIndex = 0
  while (isOnOrAfterDate(asOfDate, addMonthsISO(hireDate, (cycleIndex + 1) * 12))) {
    cycleIndex++
  }
  return {
    cycleIndex,
    start: addMonthsISO(hireDate, cycleIndex * 12),
    end: addMonthsISO(hireDate, (cycleIndex + 1) * 12),
  }
}

export function getMonthlyEvaluationPeriod(hireDate: string, monthIndex: number) {
  return {
    start: addMonthsISO(hireDate, monthIndex - 1),
    end: addMonthsISO(hireDate, monthIndex),
  }
}

export function getMonthlyAnniversaryIndex(hireDate: string, date: string): number | null {
  const diff = differenceInCalendarMonths(parseISO(date), parseISO(hireDate))
  if (diff < 1) return null
  return addMonthsISO(hireDate, diff) === date ? diff : null
}

import { getMonthlyEvaluationPeriod } from './leave-cycle'

export function isFullAttendance(
  hireDate: string,
  monthIndex: number,
  exceptionPeriodStarts: string[]
): boolean {
  const period = getMonthlyEvaluationPeriod(hireDate, monthIndex)
  return !exceptionPeriodStarts.includes(period.start)
}

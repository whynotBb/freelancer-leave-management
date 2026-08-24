import { getMonthlyEvaluationPeriod } from './leave-cycle'

export interface DateRange {
  startDate: string
  endDate: string
}

export function isFullAttendance(
  hireDate: string,
  monthIndex: number,
  approvedFullLeavePeriods: DateRange[]
): boolean {
  const period = getMonthlyEvaluationPeriod(hireDate, monthIndex)
  return !approvedFullLeavePeriods.some((leave) => rangesOverlap(leave, period))
}

function rangesOverlap(leave: DateRange, evaluationPeriod: { start: string; end: string }): boolean {
  return leave.startDate < evaluationPeriod.end && evaluationPeriod.start <= leave.endDate
}

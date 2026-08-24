import { getCurrentCycle } from './leave-cycle'

export interface GrantRecord {
  amount: number
  grantDate: string
}

export interface UsageRecord {
  requestedDays: number
  startDate: string
}

export interface LeaveBalanceResult {
  cycleStart: string
  cycleEnd: string
  granted: number
  used: number
  remaining: number
}

export function calculateLeaveBalance(
  hireDate: string,
  asOfDate: string,
  grants: GrantRecord[],
  approvedUsages: UsageRecord[]
): LeaveBalanceResult {
  const cycle = getCurrentCycle(hireDate, asOfDate)
  const inCycle = (date: string) => date >= cycle.start && date < cycle.end

  const granted = grants
    .filter((g) => inCycle(g.grantDate))
    .reduce((sum, g) => sum + g.amount, 0)
  const used = approvedUsages
    .filter((u) => inCycle(u.startDate))
    .reduce((sum, u) => sum + u.requestedDays, 0)

  return { cycleStart: cycle.start, cycleEnd: cycle.end, granted, used, remaining: granted - used }
}

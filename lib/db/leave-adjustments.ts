// lib/db/leave-adjustments.ts
import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { leaveGrants, leaveRequests } from '@/lib/db/schema'
import { calculateLeaveBalance, type LeaveBalanceResult } from '@/lib/domain/leave-balance'
import { buildGrantAdjustmentRow, buildUsageAdjustmentRow, type GrantAdjustmentRow, type UsageAdjustmentRow } from '@/lib/domain/leave-adjustment'

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

export async function getLeaveBalance(
  userId: number,
  hireDate: string,
  asOfDate: string
): Promise<LeaveBalanceResult> {
  const grants = await db
    .select({ amount: leaveGrants.amount, grantDate: leaveGrants.grantDate })
    .from(leaveGrants)
    .where(eq(leaveGrants.userId, userId))
  const usages = await db
    .select({ requestedDays: leaveRequests.requestedDays, startDate: leaveRequests.startDate })
    .from(leaveRequests)
    .where(and(eq(leaveRequests.userId, userId), eq(leaveRequests.status, 'APPROVED')))
  return calculateLeaveBalance(hireDate, asOfDate, grants, usages)
}

export async function applyGrantAdjustment(params: {
  userId: number
  hireDate: string
  newGranted: number
  reason: string
  createdBy: number
}): Promise<GrantAdjustmentRow | null> {
  const asOfDate = today()
  const balance = await getLeaveBalance(params.userId, params.hireDate, asOfDate)
  const row = buildGrantAdjustmentRow({
    userId: params.userId,
    currentGranted: balance.granted,
    newGranted: params.newGranted,
    today: asOfDate,
    cycleEnd: balance.cycleEnd,
    reason: params.reason,
    createdBy: params.createdBy,
  })
  if (row) await db.insert(leaveGrants).values(row)
  return row
}

export async function applyUsageAdjustment(params: {
  userId: number
  hireDate: string
  newUsed: number
  reason: string
  approverId: number
}): Promise<UsageAdjustmentRow | null> {
  const asOfDate = today()
  const balance = await getLeaveBalance(params.userId, params.hireDate, asOfDate)
  const row = buildUsageAdjustmentRow({
    userId: params.userId,
    currentUsed: balance.used,
    newUsed: params.newUsed,
    today: asOfDate,
    reason: params.reason,
    approverId: params.approverId,
  })
  if (row) await db.insert(leaveRequests).values(row)
  return row
}

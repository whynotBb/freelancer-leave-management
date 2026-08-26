import { and, eq } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { db } from '@/lib/db/client'
import { approverChanges, attendanceExceptions, leaveGrants, leaveRequests, users } from '@/lib/db/schema'
import { buildHistoryTimeline, type HistoryEntry } from '@/lib/domain/user-history'

export async function getUserHistory(userId: number): Promise<HistoryEntry[]> {
  const creator = alias(users, 'creator')
  const grantRows = await db
    .select({
      grantDate: leaveGrants.grantDate,
      amount: leaveGrants.amount,
      note: leaveGrants.note,
      createdBy: leaveGrants.createdBy,
      createdByName: creator.name,
      createdAt: leaveGrants.createdAt,
    })
    .from(leaveGrants)
    .leftJoin(creator, eq(leaveGrants.createdBy, creator.id))
    .where(eq(leaveGrants.userId, userId))

  const approver = alias(users, 'approver')
  const usageRows = await db
    .select({
      startDate: leaveRequests.startDate,
      requestedDays: leaveRequests.requestedDays,
      reason: leaveRequests.reason,
      type: leaveRequests.type,
      approverName: approver.name,
      createdAt: leaveRequests.createdAt,
    })
    .from(leaveRequests)
    .leftJoin(approver, eq(leaveRequests.approverId, approver.id))
    .where(and(eq(leaveRequests.userId, userId), eq(leaveRequests.status, 'APPROVED')))

  const beforeApprover = alias(users, 'beforeApprover')
  const afterApprover = alias(users, 'afterApprover')
  const changer = alias(users, 'changer')
  const approverChangeRows = await db
    .select({
      createdAt: approverChanges.createdAt,
      reason: approverChanges.reason,
      beforeApproverName: beforeApprover.name,
      afterApproverName: afterApprover.name,
      changedByName: changer.name,
    })
    .from(approverChanges)
    .leftJoin(beforeApprover, eq(approverChanges.beforeApproverId, beforeApprover.id))
    .leftJoin(afterApprover, eq(approverChanges.afterApproverId, afterApprover.id))
    .leftJoin(changer, eq(approverChanges.changedBy, changer.id))
    .where(eq(approverChanges.userId, userId))

  const exceptionCreator = alias(users, 'exceptionCreator')
  const exceptionRows = await db
    .select({
      periodStart: attendanceExceptions.periodStart,
      reason: attendanceExceptions.reason,
      createdByName: exceptionCreator.name,
      createdAt: attendanceExceptions.createdAt,
    })
    .from(attendanceExceptions)
    .leftJoin(exceptionCreator, eq(attendanceExceptions.createdBy, exceptionCreator.id))
    .where(eq(attendanceExceptions.userId, userId))

  return buildHistoryTimeline({
    grants: grantRows.map((g) => ({ ...g, createdAt: g.createdAt.toISOString() })),
    usages: usageRows.map((u) => ({ ...u, createdAt: u.createdAt.toISOString() })),
    approverChanges: approverChangeRows.map((c) => ({
      ...c,
      createdAt: c.createdAt.toISOString(),
      afterApproverName: c.afterApproverName ?? '-',
      changedByName: c.changedByName ?? '-',
    })),
    exceptions: exceptionRows.map((ex) => ({ ...ex, createdAt: ex.createdAt.toISOString() })),
  })
}

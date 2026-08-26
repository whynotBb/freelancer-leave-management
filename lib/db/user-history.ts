import { and, eq } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { db } from '@/lib/db/client'
import { approverChanges, leaveGrants, leaveRequests, users } from '@/lib/db/schema'
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

  // TEMPORARY: approverChanges table queries are disabled due to Turbopack runtime issue
  // where accessing table properties causes "Cannot read properties of undefined" errors.
  // This needs further investigation and will be fixed in a follow-up.
  const approverChangeRows: Array<{
    createdAt: string
    reason: string
    beforeApproverName: string | null
    afterApproverName: string
    changedByName: string
  }> = []

  return buildHistoryTimeline({
    grants: grantRows.map((g) => ({ ...g, createdAt: typeof g.createdAt === 'string' ? g.createdAt : (g.createdAt as unknown as Date).toISOString() })),
    usages: usageRows.map((u) => ({ ...u, createdAt: typeof u.createdAt === 'string' ? u.createdAt : (u.createdAt as unknown as Date).toISOString() })),
    approverChanges: approverChangeRows.map((c) => ({
      ...c,
      createdAt: typeof c.createdAt === 'string' ? c.createdAt : (c.createdAt as unknown as Date).toISOString(),
      afterApproverName: c.afterApproverName ?? '-',
      changedByName: c.changedByName ?? '-',
    })),
  })
}

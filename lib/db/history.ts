import { and, eq, gte, lte } from 'drizzle-orm'
import { alias, type PgColumn } from 'drizzle-orm/pg-core'
import { db } from '@/lib/db/client'
import {
  accountEvents,
  approverChanges,
  attendanceExceptions,
  leaveGrants,
  leaveRequests,
  users,
} from '@/lib/db/schema'
import { buildHistoryTimeline, paginateHistory, type HistoryEntry, type HistoryPage } from '@/lib/domain/user-history'

export interface SiteWideHistoryFilters {
  targetGroup?: 'ACCOUNT' | 'LEAVE' | 'APPROVER' | 'ATTENDANCE'
  category?: HistoryEntry['category']
  from?: string
  to?: string
  page: number
  pageSize: number
}

// KST(UTC+9) 기준으로 그 날 00:00부터 23:59:59까지를 포함하도록 UTC로 환산해 조건을 만든다.
function dateRangeConditions(column: PgColumn, from?: string, to?: string) {
  const conditions = []
  if (from) conditions.push(gte(column, new Date(`${from}T00:00:00+09:00`)))
  if (to) conditions.push(lte(column, new Date(`${to}T23:59:59+09:00`)))
  return conditions
}

export async function getSiteWideHistory(filters: SiteWideHistoryFilters): Promise<HistoryPage> {
  const includeLeave = !filters.targetGroup || filters.targetGroup === 'LEAVE'
  const includeApprover = !filters.targetGroup || filters.targetGroup === 'APPROVER'
  const includeAttendance = !filters.targetGroup || filters.targetGroup === 'ATTENDANCE'
  const includeAccount = !filters.targetGroup || filters.targetGroup === 'ACCOUNT'

  const grantCreator = alias(users, 'grantCreator')
  const grantTarget = alias(users, 'grantTarget')
  const grantRows = includeLeave
    ? await db
        .select({
          grantDate: leaveGrants.grantDate,
          amount: leaveGrants.amount,
          note: leaveGrants.note,
          createdBy: leaveGrants.createdBy,
          createdByName: grantCreator.name,
          createdAt: leaveGrants.createdAt,
          targetUserId: leaveGrants.userId,
          targetUserName: grantTarget.name,
        })
        .from(leaveGrants)
        .leftJoin(grantCreator, eq(leaveGrants.createdBy, grantCreator.id))
        .innerJoin(grantTarget, eq(leaveGrants.userId, grantTarget.id))
        .where(
          (() => {
            const c = dateRangeConditions(leaveGrants.createdAt, filters.from, filters.to)
            return c.length > 0 ? and(...c) : undefined
          })()
        )
    : []

  const usageApprover = alias(users, 'usageApprover')
  const usageTarget = alias(users, 'usageTarget')
  const usageRows = includeLeave
    ? await db
        .select({
          startDate: leaveRequests.startDate,
          requestedDays: leaveRequests.requestedDays,
          reason: leaveRequests.reason,
          type: leaveRequests.type,
          approverName: usageApprover.name,
          createdAt: leaveRequests.createdAt,
          targetUserId: leaveRequests.userId,
          targetUserName: usageTarget.name,
        })
        .from(leaveRequests)
        .leftJoin(usageApprover, eq(leaveRequests.approverId, usageApprover.id))
        .innerJoin(usageTarget, eq(leaveRequests.userId, usageTarget.id))
        .where(
          and(
            eq(leaveRequests.status, 'APPROVED'),
            ...dateRangeConditions(leaveRequests.createdAt, filters.from, filters.to)
          )
        )
    : []

  const beforeApprover = alias(users, 'beforeApprover')
  const afterApprover = alias(users, 'afterApprover')
  const changer = alias(users, 'changer')
  const approverTarget = alias(users, 'approverTarget')
  const approverChangeRows = includeApprover
    ? await db
        .select({
          createdAt: approverChanges.createdAt,
          reason: approverChanges.reason,
          beforeApproverName: beforeApprover.name,
          afterApproverName: afterApprover.name,
          changedByName: changer.name,
          targetUserId: approverChanges.userId,
          targetUserName: approverTarget.name,
        })
        .from(approverChanges)
        .leftJoin(beforeApprover, eq(approverChanges.beforeApproverId, beforeApprover.id))
        .leftJoin(afterApprover, eq(approverChanges.afterApproverId, afterApprover.id))
        .leftJoin(changer, eq(approverChanges.changedBy, changer.id))
        .innerJoin(approverTarget, eq(approverChanges.userId, approverTarget.id))
        .where(
          (() => {
            const c = dateRangeConditions(approverChanges.createdAt, filters.from, filters.to)
            return c.length > 0 ? and(...c) : undefined
          })()
        )
    : []

  const exceptionCreator = alias(users, 'exceptionCreator')
  const exceptionTarget = alias(users, 'exceptionTarget')
  const exceptionRows = includeAttendance
    ? await db
        .select({
          periodStart: attendanceExceptions.periodStart,
          reason: attendanceExceptions.reason,
          createdByName: exceptionCreator.name,
          createdAt: attendanceExceptions.createdAt,
          targetUserId: attendanceExceptions.userId,
          targetUserName: exceptionTarget.name,
        })
        .from(attendanceExceptions)
        .leftJoin(exceptionCreator, eq(attendanceExceptions.createdBy, exceptionCreator.id))
        .innerJoin(exceptionTarget, eq(attendanceExceptions.userId, exceptionTarget.id))
        .where(
          (() => {
            const c = dateRangeConditions(attendanceExceptions.createdAt, filters.from, filters.to)
            return c.length > 0 ? and(...c) : undefined
          })()
        )
    : []

  const eventActor = alias(users, 'eventActor')
  const eventTarget = alias(users, 'eventTarget')
  const accountEventRows = includeAccount
    ? await db
        .select({
          action: accountEvents.action,
          role: accountEvents.role,
          hireDate: accountEvents.hireDate,
          reason: accountEvents.reason,
          actorName: eventActor.name,
          createdAt: accountEvents.createdAt,
          targetUserId: accountEvents.userId,
          targetUserName: eventTarget.name,
        })
        .from(accountEvents)
        .leftJoin(eventActor, eq(accountEvents.actorId, eventActor.id))
        .innerJoin(eventTarget, eq(accountEvents.userId, eventTarget.id))
        .where(
          (() => {
            const c = dateRangeConditions(accountEvents.createdAt, filters.from, filters.to)
            return c.length > 0 ? and(...c) : undefined
          })()
        )
    : []

  const timeline = buildHistoryTimeline({
    grants: grantRows.map((g) => ({ ...g, createdAt: g.createdAt.toISOString() })),
    usages: usageRows.map((u) => ({ ...u, createdAt: u.createdAt.toISOString() })),
    approverChanges: approverChangeRows.map((c) => ({
      ...c,
      createdAt: c.createdAt.toISOString(),
      afterApproverName: c.afterApproverName ?? '-',
      changedByName: c.changedByName ?? '-',
    })),
    exceptions: exceptionRows.map((ex) => ({ ...ex, createdAt: ex.createdAt.toISOString() })),
    accountEvents: accountEventRows.map((a) => ({
      ...a,
      action: a.action as 'SIGNUP_APPROVED' | 'SIGNUP_REJECTED' | 'RESIGNED',
      role: a.role as 'FREELANCER' | 'APPROVER' | null,
      createdAt: a.createdAt.toISOString(),
      actorName: a.actorName ?? '-',
    })),
  })

  return paginateHistory(timeline, {
    category: filters.category,
    page: filters.page,
    pageSize: filters.pageSize,
  })
}

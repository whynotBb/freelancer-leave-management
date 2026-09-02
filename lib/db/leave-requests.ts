import { and, eq, ne } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { db } from '@/lib/db/client'
import { leaveGrants, leaveRequests, users } from '@/lib/db/schema'
import { getLeaveBalance } from '@/lib/db/leave-adjustments'
import {
  buildMyDocumentTimeline,
  type MyDocumentEntry,
  type MyLeaveRequestRow,
} from '@/lib/domain/my-document-timeline'
import { getYearsOfService } from '@/lib/domain/date-utils'

export interface MyDocumentSummary {
  hireDate: string | null
  yearsOfService: number | null
  granted: number
  used: number
  remaining: number
  defaultApproverId: number | null
}

export async function getMyDocumentSummary(userId: number): Promise<MyDocumentSummary> {
  const [user] = await db
    .select({ hireDate: users.hireDate, defaultApproverId: users.defaultApproverId })
    .from(users)
    .where(eq(users.id, userId))

  if (!user?.hireDate) {
    return {
      hireDate: null,
      yearsOfService: null,
      granted: 0,
      used: 0,
      remaining: 0,
      defaultApproverId: user?.defaultApproverId ?? null,
    }
  }

  const today = new Date().toISOString().slice(0, 10)
  const balance = await getLeaveBalance(userId, user.hireDate, today)
  return {
    hireDate: user.hireDate,
    yearsOfService: getYearsOfService(user.hireDate, today),
    granted: balance.granted,
    used: balance.used,
    remaining: balance.remaining,
    defaultApproverId: user.defaultApproverId,
  }
}

export async function getMyDocumentTimeline(userId: number): Promise<MyDocumentEntry[]> {
  const approver = alias(users, 'approver')
  const requestRows = await db
    .select({
      id: leaveRequests.id,
      title: leaveRequests.title,
      startDate: leaveRequests.startDate,
      endDate: leaveRequests.endDate,
      type: leaveRequests.type,
      requestedDays: leaveRequests.requestedDays,
      status: leaveRequests.status,
      reason: leaveRequests.reason,
      approverId: leaveRequests.approverId,
      approverName: approver.name,
      rejectReason: leaveRequests.rejectReason,
      createdAt: leaveRequests.createdAt,
    })
    .from(leaveRequests)
    .leftJoin(approver, eq(leaveRequests.approverId, approver.id))
    .where(eq(leaveRequests.userId, userId))

  const creator = alias(users, 'creator')
  const grantRows = await db
    .select({
      amount: leaveGrants.amount,
      note: leaveGrants.note,
      createdBy: leaveGrants.createdBy,
      createdByName: creator.name,
      createdAt: leaveGrants.createdAt,
    })
    .from(leaveGrants)
    .leftJoin(creator, eq(leaveGrants.createdBy, creator.id))
    .where(eq(leaveGrants.userId, userId))

  return buildMyDocumentTimeline({
    requests: requestRows.map(
      (r): MyLeaveRequestRow => ({
        ...r,
        type: r.type as MyLeaveRequestRow['type'],
        status: r.status as MyLeaveRequestRow['status'],
        createdAt: r.createdAt.toISOString(),
      })
    ),
    grants: grantRows.map((g) => ({ ...g, createdAt: g.createdAt.toISOString() })),
  })
}

// hasOverlappingActiveRequest(기존, PENDING/APPROVED만 걸러 비교)에 넘길 원본 목록이다.
// type='ADJUSTMENT'(관리자 수동 조정 기록, 실제 신청이 아님)만 제외하고 FULL/AM_HALF/PM_HALF는
// 전부 포함한다 — 반차도 기간 중복 검사 대상이다.
export async function getOwnActiveRequestRanges(
  userId: number
): Promise<{ startDate: string; endDate: string; status: string }[]> {
  return db
    .select({ startDate: leaveRequests.startDate, endDate: leaveRequests.endDate, status: leaveRequests.status })
    .from(leaveRequests)
    .where(and(eq(leaveRequests.userId, userId), ne(leaveRequests.type, 'ADJUSTMENT')))
}

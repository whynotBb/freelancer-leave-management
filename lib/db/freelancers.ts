import { and, eq, inArray } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { db } from './client'
import { leaveGrants, leaveRequests, users } from './schema'
import { calculateLeaveBalance } from '@/lib/domain/leave-balance'

export interface FreelancerSummary {
  id: number
  name: string
  email: string
  hireDate: string | null
  defaultApproverId: number | null
  defaultApproverName: string | null
  granted: number
  used: number
  remaining: number
}

export async function getApprovedFreelancers(): Promise<FreelancerSummary[]> {
  const approver = alias(users, 'approver')
  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      hireDate: users.hireDate,
      defaultApproverId: users.defaultApproverId,
      defaultApproverName: approver.name,
    })
    .from(users)
    .leftJoin(approver, eq(users.defaultApproverId, approver.id))
    .where(and(eq(users.signupStatus, 'APPROVED'), eq(users.role, 'FREELANCER')))

  const userIds = rows.map((u) => u.id)
  // 프리랜서 수만큼 발생/사용 내역을 개별 조회하면(N+1) 목록이 커질수록 응답이 느려지므로,
  // 전체를 한 번에 조회해 userId별로 묶은 뒤 순수 함수(calculateLeaveBalance)에 그대로 넘긴다.
  const [allGrants, allUsages] = userIds.length
    ? await Promise.all([
        db
          .select({ userId: leaveGrants.userId, amount: leaveGrants.amount, grantDate: leaveGrants.grantDate })
          .from(leaveGrants)
          .where(inArray(leaveGrants.userId, userIds)),
        db
          .select({ userId: leaveRequests.userId, requestedDays: leaveRequests.requestedDays, startDate: leaveRequests.startDate })
          .from(leaveRequests)
          .where(and(inArray(leaveRequests.userId, userIds), eq(leaveRequests.status, 'APPROVED'))),
      ])
    : [[], []]

  const grantsByUser = new Map<number, { amount: number; grantDate: string }[]>()
  for (const g of allGrants) {
    const list = grantsByUser.get(g.userId) ?? []
    list.push({ amount: g.amount, grantDate: g.grantDate })
    grantsByUser.set(g.userId, list)
  }
  const usagesByUser = new Map<number, { requestedDays: number; startDate: string }[]>()
  for (const u of allUsages) {
    const list = usagesByUser.get(u.userId) ?? []
    list.push({ requestedDays: u.requestedDays, startDate: u.startDate })
    usagesByUser.set(u.userId, list)
  }

  const today = new Date().toISOString().slice(0, 10)
  return rows.map((u) => {
    const balance = u.hireDate
      ? calculateLeaveBalance(u.hireDate, today, grantsByUser.get(u.id) ?? [], usagesByUser.get(u.id) ?? [])
      : { granted: 0, used: 0, remaining: 0 }
    return { ...u, ...balance }
  })
}

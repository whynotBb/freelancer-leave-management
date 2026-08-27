import { and, eq } from 'drizzle-orm'
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
  const approvedFreelancer = and(eq(users.signupStatus, 'APPROVED'), eq(users.role, 'FREELANCER'))

  // 발생/사용 내역 조회를 목록 조회 결과(userId)에 의존시키지 않고 users에 직접 조인해
  // 같은 조건으로 걸러지도록 하면, 세 쿼리를 순차 왕복 없이 한 번에 병렬로 보낼 수 있다.
  const [rows, allGrants, allUsages] = await Promise.all([
    db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        hireDate: users.hireDate,
        defaultApproverId: users.defaultApproverId,
        defaultApproverName: approver.name,
      })
      .from(users)
      .leftJoin(approver, and(eq(users.defaultApproverId, approver.id), eq(approver.signupStatus, 'APPROVED')))
      .where(approvedFreelancer),
    db
      .select({ userId: leaveGrants.userId, amount: leaveGrants.amount, grantDate: leaveGrants.grantDate })
      .from(leaveGrants)
      .innerJoin(users, eq(leaveGrants.userId, users.id))
      .where(approvedFreelancer),
    db
      .select({ userId: leaveRequests.userId, requestedDays: leaveRequests.requestedDays, startDate: leaveRequests.startDate })
      .from(leaveRequests)
      .innerJoin(users, eq(leaveRequests.userId, users.id))
      .where(and(approvedFreelancer, eq(leaveRequests.status, 'APPROVED'))),
  ])

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

import { and, eq } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { db } from './client'
import { users } from './schema'
import { getLeaveBalance } from './leave-adjustments'

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

  const today = new Date().toISOString().slice(0, 10)
  return Promise.all(
    rows.map(async (u) => {
      const balance = u.hireDate
        ? await getLeaveBalance(u.id, u.hireDate, today)
        : { granted: 0, used: 0, remaining: 0 }
      return { ...u, ...balance }
    })
  )
}

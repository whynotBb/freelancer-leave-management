import { and, eq } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import { users } from '@/lib/db/schema'
import { requireApproverOrAbove, toAuthErrorResponse } from '@/lib/auth/session'
import { getLeaveBalance } from '@/lib/db/leave-adjustments'

export async function GET() {
  try {
    const session = await requireApproverOrAbove()
    const role = (session.user as { role?: string }).role
    const callerId = Number((session.user as { id?: string }).id)

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
    const result = await Promise.all(
      rows.map(async (u) => {
        const balance = u.hireDate
          ? await getLeaveBalance(u.id, u.hireDate, today)
          : { granted: 0, used: 0, remaining: 0 }
        return {
          ...u,
          granted: balance.granted,
          used: balance.used,
          remaining: balance.remaining,
          canEdit: role === 'SUPER_ADMIN' || u.defaultApproverId === callerId,
        }
      })
    )
    return NextResponse.json(result)
  } catch (error) {
    const response = toAuthErrorResponse(error)
    if (response) return response
    throw error
  }
}

import { NextResponse } from 'next/server'
import { desc, inArray, sql } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { users } from '@/lib/db/schema'
import { requireSuperAdmin, toAuthErrorResponse } from '@/lib/auth/session'

export async function GET() {
  try {
    await requireSuperAdmin()

    const list = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
        signupStatus: users.signupStatus,
        hireDate: users.hireDate,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(inArray(users.signupStatus, ['PENDING', 'APPROVED']))
      .orderBy(sql`case when ${users.signupStatus} = 'PENDING' then 0 else 1 end`, desc(users.createdAt))

    return NextResponse.json(list)
  } catch (error) {
    const response = toAuthErrorResponse(error)
    if (response) return response
    throw error
  }
}

import { and, eq, inArray } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import { users } from '@/lib/db/schema'
import { requireApprovedUser, toAuthErrorResponse } from '@/lib/auth/session'

export async function GET() {
  try {
    await requireApprovedUser()
    const list = await db
      .select({ id: users.id, name: users.name, email: users.email, role: users.role })
      .from(users)
      .where(and(inArray(users.role, ['APPROVER', 'SUPER_ADMIN']), eq(users.signupStatus, 'APPROVED')))
    return NextResponse.json(list)
  } catch (error) {
    const response = toAuthErrorResponse(error)
    if (response) return response
    throw error
  }
}

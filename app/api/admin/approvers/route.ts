import { inArray } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import { users } from '@/lib/db/schema'
import { requireSuperAdmin, toAuthErrorResponse } from '@/lib/auth/session'

export async function GET() {
  try {
    await requireSuperAdmin()
    const list = await db
      .select({ id: users.id, name: users.name, email: users.email, role: users.role })
      .from(users)
      .where(inArray(users.role, ['APPROVER', 'SUPER_ADMIN']))
    return NextResponse.json(list)
  } catch (error) {
    const response = toAuthErrorResponse(error)
    if (response) return response
    throw error
  }
}

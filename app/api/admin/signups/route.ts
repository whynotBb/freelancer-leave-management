import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import { users } from '@/lib/db/schema'
import { requireAdmin } from '@/lib/auth/session'

export async function GET() {
  await requireAdmin()
  const pending = await db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .where(eq(users.signupStatus, 'PENDING'))
  return NextResponse.json(pending)
}

import { NextResponse } from 'next/server'
import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { accountEvents, users } from '@/lib/db/schema'
import { requireSuperAdmin, toAuthErrorResponse } from '@/lib/auth/session'

export async function PATCH(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSuperAdmin()
    const actorId = Number((session.user as { id?: string }).id)
    const { id } = await params

    const updated = await db
      .update(users)
      .set({ signupStatus: 'REJECTED' })
      .where(and(eq(users.id, Number(id)), eq(users.signupStatus, 'PENDING')))
      .returning({ id: users.id })

    if (updated.length > 0) {
      await db.insert(accountEvents).values({
        userId: Number(id),
        actorId,
        action: 'SIGNUP_REJECTED',
      })
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    const response = toAuthErrorResponse(error)
    if (response) return response
    throw error
  }
}

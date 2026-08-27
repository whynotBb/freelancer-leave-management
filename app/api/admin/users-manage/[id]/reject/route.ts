import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { users } from '@/lib/db/schema'
import { requireSuperAdmin, toAuthErrorResponse } from '@/lib/auth/session'

export async function PATCH(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireSuperAdmin()
    const { id } = await params

    await db.update(users).set({ signupStatus: 'REJECTED' }).where(eq(users.id, Number(id)))

    return NextResponse.json({ ok: true })
  } catch (error) {
    const response = toAuthErrorResponse(error)
    if (response) return response
    throw error
  }
}

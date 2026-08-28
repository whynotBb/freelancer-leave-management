import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { accountEvents, users } from '@/lib/db/schema'
import { generateTempPassword } from '@/lib/domain/password-policy'
import { requireSuperAdmin, toAuthErrorResponse } from '@/lib/auth/session'

export async function PATCH(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSuperAdmin()
    const actorId = Number((session.user as { id?: string }).id)
    const { id } = await params
    const targetId = Number(id)

    const tempPassword = generateTempPassword()
    const passwordHash = await bcrypt.hash(tempPassword, 10)

    const updated = await db.transaction(async (tx) => {
      const rows = await tx
        .update(users)
        .set({ passwordHash, mustChangePassword: true, passwordChangedAt: new Date() })
        .where(and(eq(users.id, targetId), eq(users.signupStatus, 'APPROVED')))
        .returning({ id: users.id })

      if (rows.length > 0) {
        await tx.insert(accountEvents).values({
          userId: targetId,
          actorId,
          action: 'PASSWORD_RESET',
        })
      }
      return rows
    })

    if (updated.length === 0) {
      return NextResponse.json({ error: '대상을 찾을 수 없습니다.' }, { status: 400 })
    }

    return NextResponse.json({ ok: true, tempPassword })
  } catch (error) {
    const response = toAuthErrorResponse(error)
    if (response) return response
    throw error
  }
}

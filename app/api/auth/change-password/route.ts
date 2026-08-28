import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/lib/db/client'
import { users } from '@/lib/db/schema'
import { requireApprovedUser, toAuthErrorResponse } from '@/lib/auth/session'
import { isValidPassword, PASSWORD_POLICY_HINT } from '@/lib/domain/password-policy'

const bodySchema = z.object({
  password: z.string().refine(isValidPassword, { message: PASSWORD_POLICY_HINT }),
})

export async function POST(request: Request) {
  try {
    const session = await requireApprovedUser()
    const userId = Number((session.user as { id?: string }).id)

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: '입력값이 올바르지 않습니다.' }, { status: 400 })
    }
    const parsed = bodySchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: PASSWORD_POLICY_HINT }, { status: 400 })
    }

    const passwordHash = await bcrypt.hash(parsed.data.password, 10)
    await db
      .update(users)
      .set({ passwordHash, mustChangePassword: false, passwordChangedAt: new Date() })
      .where(eq(users.id, userId))

    return NextResponse.json({ ok: true })
  } catch (error) {
    const response = toAuthErrorResponse(error)
    if (response) return response
    throw error
  }
}

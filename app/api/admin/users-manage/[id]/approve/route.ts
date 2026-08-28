import { NextResponse } from 'next/server'
import { z } from 'zod'
import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { accountEvents, users } from '@/lib/db/schema'
import { requireSuperAdmin, toAuthErrorResponse } from '@/lib/auth/session'

const bodySchema = z.object({
  role: z.enum(['FREELANCER', 'APPROVER']),
  hireDate: z.string().optional(),
})

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSuperAdmin()
    const actorId = Number((session.user as { id?: string }).id)
    const { id } = await params

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: '입력값이 올바르지 않습니다.' }, { status: 400 })
    }
    const parsed = bodySchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: '입력값이 올바르지 않습니다.' }, { status: 400 })
    }
    if (parsed.data.role === 'FREELANCER' && !parsed.data.hireDate) {
      return NextResponse.json({ error: '프리랜서 승인 시 입사일은 필수입니다.' }, { status: 400 })
    }

    const isFreelancer = parsed.data.role === 'FREELANCER'
    const hireDate = isFreelancer ? (parsed.data.hireDate ?? null) : null

    const updated = await db
      .update(users)
      .set({
        signupStatus: 'APPROVED',
        role: parsed.data.role,
        hireDate,
      })
      .where(and(eq(users.id, Number(id)), eq(users.signupStatus, 'PENDING')))
      .returning({ id: users.id })

    // 이미 처리된(PENDING이 아닌) 계정이면 update가 0건이라 이력도 남기지 않는다.
    if (updated.length > 0) {
      await db.insert(accountEvents).values({
        userId: Number(id),
        actorId,
        action: 'SIGNUP_APPROVED',
        role: parsed.data.role,
        hireDate,
      })
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    const response = toAuthErrorResponse(error)
    if (response) return response
    throw error
  }
}

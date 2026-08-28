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

    // 계정 상태 변경과 이력 기록을 하나의 트랜잭션으로 묶어 이력 insert가 실패해도
    // 상태 변경만 반영되고 이력이 누락되는 일이 없도록 한다.
    await db.transaction(async (tx) => {
      const updated = await tx
        .update(users)
        .set({ signupStatus: 'REJECTED' })
        .where(and(eq(users.id, Number(id)), eq(users.signupStatus, 'PENDING')))
        .returning({ id: users.id })

      if (updated.length > 0) {
        await tx.insert(accountEvents).values({
          userId: Number(id),
          actorId,
          action: 'SIGNUP_REJECTED',
        })
      }
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    const response = toAuthErrorResponse(error)
    if (response) return response
    throw error
  }
}

import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db/client'
import { users } from '@/lib/db/schema'
import { requireApproverOrAbove, toAuthErrorResponse } from '@/lib/auth/session'
import { createAttendanceException } from '@/lib/db/attendance-exceptions'

const bodySchema = z.object({
  date: z.string().min(1),
  reason: z.string().min(1),
})

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireApproverOrAbove()
    const role = (session.user as { role?: string }).role
    const callerId = Number((session.user as { id?: string }).id)
    const { id } = await params
    const targetId = Number(id)

    let rawBody: unknown
    try {
      rawBody = await request.json()
    } catch {
      return NextResponse.json({ error: '입력값이 올바르지 않습니다.' }, { status: 400 })
    }
    const parsed = bodySchema.safeParse(rawBody)
    if (!parsed.success) {
      return NextResponse.json({ error: '입력값이 올바르지 않습니다.' }, { status: 400 })
    }

    const [target] = await db.select().from(users).where(eq(users.id, targetId))
    if (!target || target.role !== 'FREELANCER') {
      return NextResponse.json({ error: '대상을 찾을 수 없습니다.' }, { status: 404 })
    }
    if (role !== 'SUPER_ADMIN' && target.defaultApproverId !== callerId) {
      return NextResponse.json({ error: '이 프리랜서를 수정할 권한이 없습니다.' }, { status: 403 })
    }
    if (!target.hireDate) {
      return NextResponse.json({ error: '입사일이 등록되지 않은 프리랜서입니다.' }, { status: 400 })
    }

    const result = await createAttendanceException({
      userId: targetId,
      hireDate: target.hireDate,
      date: parsed.data.date,
      reason: parsed.data.reason,
      createdBy: callerId,
    })
    if ('error' in result) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }
    return NextResponse.json({ ok: true, periodStart: result.periodStart })
  } catch (error) {
    const response = toAuthErrorResponse(error)
    if (response) return response
    throw error
  }
}

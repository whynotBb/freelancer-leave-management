import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db/client'
import { users } from '@/lib/db/schema'
import { requireAdmin } from '@/lib/auth/session'

const decisionSchema = z.object({
  decision: z.enum(['APPROVED', 'REJECTED']),
  hireDate: z.string().optional(),
  position: z.string().optional(),
  department: z.string().optional(),
  defaultApproverId: z.number().optional(),
})

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireAdmin()
  const { id } = await params
  const body = await request.json()
  const parsed = decisionSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: '입력값이 올바르지 않습니다.' }, { status: 400 })
  }

  if (parsed.data.decision === 'APPROVED' && !parsed.data.hireDate) {
    return NextResponse.json({ error: '승인 시 입사일은 필수입니다.' }, { status: 400 })
  }

  await db
    .update(users)
    .set({
      signupStatus: parsed.data.decision,
      hireDate: parsed.data.hireDate,
      position: parsed.data.position,
      department: parsed.data.department,
      defaultApproverId: parsed.data.defaultApproverId,
    })
    .where(eq(users.id, Number(id)))

  return NextResponse.json({ ok: true })
}

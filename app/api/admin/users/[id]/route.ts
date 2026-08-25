import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db/client'
import { users } from '@/lib/db/schema'
import { requireAdmin } from '@/lib/auth/session'

const updateSchema = z.object({
  position: z.string().optional(),
  department: z.string().optional(),
  defaultApproverId: z.number().optional(),
})

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireAdmin()
  const { id } = await params
  const parsed = updateSchema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json({ error: '입력값이 올바르지 않습니다.' }, { status: 400 })
  }
  await db.update(users).set(parsed.data).where(eq(users.id, Number(id)))
  return NextResponse.json({ ok: true })
}

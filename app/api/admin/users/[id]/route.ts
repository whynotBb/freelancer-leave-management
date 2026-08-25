import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db/client'
import { users } from '@/lib/db/schema'
import { requireApproverOrAbove, toAuthErrorResponse } from '@/lib/auth/session'
import { applyGrantAdjustment, applyUsageAdjustment, getLeaveBalance } from '@/lib/db/leave-adjustments'
import { createNotification } from '@/lib/db/notifications'

const updateSchema = z.object({
  hireDate: z.string().optional(),
  defaultApproverId: z.number().optional(),
  grantedTotal: z.number().min(0).multipleOf(0.5).optional(),
  usedTotal: z.number().min(0).multipleOf(0.5).optional(),
  reason: z.string().min(1).optional(),
})

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireApproverOrAbove()
    const role = (session.user as { role?: string }).role
    const callerId = Number((session.user as { id?: string }).id)
    const { id } = await params
    const targetId = Number(id)

    const parsed = updateSchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json({ error: '입력값이 올바르지 않습니다.' }, { status: 400 })
    }
    const body = parsed.data

    const [target] = await db.select().from(users).where(eq(users.id, targetId))
    if (!target) {
      return NextResponse.json({ error: '대상을 찾을 수 없습니다.' }, { status: 404 })
    }

    if (role !== 'SUPER_ADMIN' && target.defaultApproverId !== callerId) {
      return NextResponse.json({ error: '이 프리랜서를 수정할 권한이 없습니다.' }, { status: 403 })
    }

    if (body.defaultApproverId !== undefined && role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: '기본 결재자 변경은 최고관리자만 가능합니다.' }, { status: 403 })
    }

    const needsReason = body.hireDate !== undefined || body.grantedTotal !== undefined || body.usedTotal !== undefined
    if (needsReason && !body.reason) {
      return NextResponse.json({ error: '입사일/연차 변경 시 사유는 필수입니다.' }, { status: 400 })
    }

    if (body.hireDate !== undefined) {
      await db.update(users).set({ hireDate: body.hireDate }).where(eq(users.id, targetId))
    }
    if (body.defaultApproverId !== undefined) {
      await db.update(users).set({ defaultApproverId: body.defaultApproverId }).where(eq(users.id, targetId))
    }

    const hireDate = body.hireDate ?? target.hireDate
    let adjusted = false
    if (hireDate) {
      if (body.grantedTotal !== undefined) {
        const grantRow = await applyGrantAdjustment({
          userId: targetId,
          hireDate,
          newGranted: body.grantedTotal,
          reason: body.reason!,
          createdBy: callerId,
        })
        if (grantRow) adjusted = true
      }
      if (body.usedTotal !== undefined) {
        const usageRow = await applyUsageAdjustment({
          userId: targetId,
          hireDate,
          newUsed: body.usedTotal,
          reason: body.reason!,
          approverId: callerId,
        })
        if (usageRow) adjusted = true
      }
    }

    if (adjusted) {
      await createNotification({
        recipientId: targetId,
        type: 'LEAVE_ADJUSTED',
        refId: targetId,
        message: `연차 정보가 조정되었습니다: ${body.reason}`,
      })
      const currentApproverId = body.defaultApproverId ?? target.defaultApproverId
      if (currentApproverId && currentApproverId !== callerId) {
        await createNotification({
          recipientId: currentApproverId,
          type: 'LEAVE_ADJUSTED',
          refId: targetId,
          message: `담당 프리랜서(${target.name})의 연차 정보가 조정되었습니다: ${body.reason}`,
        })
      }
    }

    const finalHireDate = hireDate
    const balance = finalHireDate
      ? await getLeaveBalance(targetId, finalHireDate, new Date().toISOString().slice(0, 10))
      : { granted: 0, used: 0, remaining: 0 }

    return NextResponse.json({ ok: true, ...balance })
  } catch (error) {
    const response = toAuthErrorResponse(error)
    if (response) return response
    throw error
  }
}

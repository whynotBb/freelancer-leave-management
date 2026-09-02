import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db/client'
import { users } from '@/lib/db/schema'
import { requireApproverOrAbove, toAuthErrorResponse } from '@/lib/auth/session'
import {
  applyGrantAdjustment,
  applyUsageAdjustment,
  getLeaveBalance,
  recordHireDateChangeMarker,
} from '@/lib/db/leave-adjustments'
import { createNotification } from '@/lib/db/notifications'
import { recordApproverChange } from '@/lib/db/approver-changes'
import { findAssignableApprover } from '@/lib/db/approvers'

const updateSchema = z.object({
  hireDate: z.string().optional(),
  defaultApproverId: z.number().optional(),
  grantedTotal: z.number().min(0).max(99).multipleOf(0.5).optional(),
  usedTotal: z.number().min(0).max(99).multipleOf(0.5).optional(),
  reason: z.string().min(1).optional(),
})

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
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
    const parsed = updateSchema.safeParse(rawBody)
    if (!parsed.success) {
      return NextResponse.json({ error: '입력값이 올바르지 않습니다.' }, { status: 400 })
    }
    const body = parsed.data

    const [target] = await db.select().from(users).where(eq(users.id, targetId))
    if (!target) {
      return NextResponse.json({ error: '대상을 찾을 수 없습니다.' }, { status: 404 })
    }

    if (target.role !== 'FREELANCER') {
      return NextResponse.json({ error: '프리랜서만 수정할 수 있습니다.' }, { status: 400 })
    }

    if (role !== 'SUPER_ADMIN' && target.defaultApproverId !== callerId) {
      return NextResponse.json({ error: '이 프리랜서를 수정할 권한이 없습니다.' }, { status: 403 })
    }

    if (body.defaultApproverId !== undefined && role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: '기본 결재자 변경은 최고관리자만 가능합니다.' }, { status: 403 })
    }

    let newApprover: { id: number; name: string } | undefined
    if (body.defaultApproverId !== undefined) {
      const approver = await findAssignableApprover(body.defaultApproverId)
      if (!approver) {
        return NextResponse.json({ error: '유효하지 않은 결재자입니다.' }, { status: 400 })
      }
      newApprover = approver
    }

    const needsReason =
      body.hireDate !== undefined ||
      body.grantedTotal !== undefined ||
      body.usedTotal !== undefined ||
      body.defaultApproverId !== undefined
    if (needsReason && !body.reason) {
      return NextResponse.json({ error: '입사일/연차/결재자 변경 시 사유는 필수입니다.' }, { status: 400 })
    }

    if (body.hireDate !== undefined) {
      await db.update(users).set({ hireDate: body.hireDate }).where(eq(users.id, targetId))
    }
    if (body.defaultApproverId !== undefined && body.defaultApproverId !== target.defaultApproverId) {
      await db.update(users).set({ defaultApproverId: body.defaultApproverId }).where(eq(users.id, targetId))
      await recordApproverChange({
        userId: targetId,
        beforeApproverId: target.defaultApproverId,
        afterApproverId: body.defaultApproverId,
        reason: body.reason!,
        changedBy: callerId,
      })
      await createNotification({
        recipientId: targetId,
        type: 'APPROVER_CHANGED',
        refId: targetId,
        message: `담당 결재자가 ${newApprover!.name}(으)로 변경되었습니다: ${body.reason}`,
      })
      await createNotification({
        recipientId: body.defaultApproverId,
        type: 'APPROVER_CHANGED',
        refId: targetId,
        message: `${target.name}의 담당 결재자로 지정되었습니다: ${body.reason}`,
      })
    }

    const hireDate = body.hireDate ?? target.hireDate

    // 발생/사용 연차 조정은 연차 계산에 입사일이 반드시 필요하다(applyGrantAdjustment/
    // applyUsageAdjustment가 hireDate를 필수 인자로 요구). 입사일이 없는 상태로 조용히
    // 넘어가면 아무 것도 저장되지 않으면서 200 응답만 돌아가 화면에는 저장된 것처럼
    // 보이다가 다시 0으로 되돌아가는 문제가 있었다 — 이를 막기 위해 명시적으로 막는다.
    if (!hireDate && (body.grantedTotal !== undefined || body.usedTotal !== undefined)) {
      return NextResponse.json({ error: '입사일을 먼저 등록해야 연차를 조정할 수 있습니다.' }, { status: 400 })
    }

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
      if (body.hireDate !== undefined && !adjusted) {
        await recordHireDateChangeMarker({
          userId: targetId,
          hireDate,
          reason: body.reason!,
          createdBy: callerId,
        })
        adjusted = true
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

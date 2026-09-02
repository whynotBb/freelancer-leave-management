import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { users } from '@/lib/db/schema'

// 연차 신청/프리랜서 정보 수정 등 여러 API가 "결재자로 지정 가능한 사용자인지" 검증한다.
// role이 APPROVER/SUPER_ADMIN이어야 함은 물론, 가입승인 상태(signupStatus === 'APPROVED')도
// 반드시 함께 확인해야 한다 — 퇴사(RESIGNED) 처리된 사용자는 role은 그대로 남아 있어도
// 더 이상 결재자로 지정돼서는 안 된다(퇴사 처리는 그 시점의 PENDING 건만 재배정하고,
// 이후 새로 지정되는 것까지는 막지 않으므로 여기서 막아야 한다).
export async function findAssignableApprover(
  approverId: number
): Promise<{ id: number; name: string } | null> {
  const [approver] = await db.select().from(users).where(eq(users.id, approverId))
  if (!approver) return null
  if (approver.role !== 'APPROVER' && approver.role !== 'SUPER_ADMIN') return null
  if (approver.signupStatus !== 'APPROVED') return null
  return { id: approver.id, name: approver.name }
}

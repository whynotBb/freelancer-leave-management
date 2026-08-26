import { db } from '@/lib/db/client'
import { approverChanges } from '@/lib/db/schema'

export async function recordApproverChange(params: {
  userId: number
  beforeApproverId: number | null
  afterApproverId: number
  reason: string
  changedBy: number
}): Promise<void> {
  await db.insert(approverChanges).values(params)
}

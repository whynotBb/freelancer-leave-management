import { db } from '@/lib/db/client'
import { attendanceExceptions } from '@/lib/db/schema'
import { findMonthlyEvaluationPeriod } from '@/lib/domain/leave-cycle'
import { isUniqueViolation } from '@/lib/db/postgres-errors'

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

export async function createAttendanceException(params: {
  userId: number
  hireDate: string
  date: string
  reason: string
  createdBy: number
}): Promise<{ periodStart: string } | { error: string }> {
  const period = findMonthlyEvaluationPeriod(params.hireDate, params.date)
  if (period.end < today()) {
    return { error: '이미 종료된 평가월은 예외로 등록할 수 없습니다.' }
  }

  try {
    await db.insert(attendanceExceptions).values({
      userId: params.userId,
      periodStart: period.start,
      reason: params.reason,
      createdBy: params.createdBy,
    })
    return { periodStart: period.start }
  } catch (error) {
    if (isUniqueViolation(error)) {
      return { error: '이미 해당 평가월에 예외가 등록되어 있습니다.' }
    }
    throw error
  }
}

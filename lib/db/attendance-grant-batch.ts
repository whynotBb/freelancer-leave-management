import { and, eq, isNotNull } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { attendanceExceptions, leaveGrants, users } from '@/lib/db/schema'
import { getCurrentCycle, getMonthlyAnniversaryIndex, getMonthlyEvaluationPeriod } from '@/lib/domain/leave-cycle'
import { isFullAttendance } from '@/lib/domain/leave-grant'
import { isUniqueViolation } from '@/lib/db/postgres-errors'

export async function runDailyAttendanceGrantBatch(
  today: string
): Promise<{ granted: number; skipped: number; failed: number }> {
  const candidates = await db
    .select({ id: users.id, hireDate: users.hireDate })
    .from(users)
    .where(and(eq(users.signupStatus, 'APPROVED'), eq(users.role, 'FREELANCER'), isNotNull(users.hireDate)))

  const exceptionRows = await db
    .select({ userId: attendanceExceptions.userId, periodStart: attendanceExceptions.periodStart })
    .from(attendanceExceptions)

  const exceptionsByUser = new Map<number, string[]>()
  for (const row of exceptionRows) {
    const list = exceptionsByUser.get(row.userId) ?? []
    list.push(row.periodStart)
    exceptionsByUser.set(row.userId, list)
  }

  let granted = 0
  let skipped = 0
  let failed = 0

  for (const candidate of candidates) {
    try {
      const hireDate = candidate.hireDate
      if (!hireDate) continue

      const monthIndex = getMonthlyAnniversaryIndex(hireDate, today)
      if (monthIndex === null) continue

      const exceptions = exceptionsByUser.get(candidate.id) ?? []
      if (!isFullAttendance(hireDate, monthIndex, exceptions)) {
        skipped++
        continue
      }

      const periodStart = getMonthlyEvaluationPeriod(hireDate, monthIndex).start
      const periodMonth = Number(periodStart.slice(5, 7))
      const cycle = getCurrentCycle(hireDate, today)

      try {
        await db.insert(leaveGrants).values({
          userId: candidate.id,
          grantDate: today,
          amount: 1,
          cycleEnd: cycle.end,
          periodStart,
          note: `${periodMonth}월 만근으로 인한 연차 자동 발생(시스템)`,
          createdBy: null,
        })
        granted++
      } catch (error) {
        if (isUniqueViolation(error)) {
          skipped++
        } else {
          throw error
        }
      }
    } catch (error) {
      failed++
      // 후보자 한 명의 예상 못한 실패가 그날 나머지 전체 배치를 중단시키지 않도록, 여기서 잡고
      // 다음 후보자로 넘어간다. 실패 건수는 응답에 포함되어 Vercel 함수 로그에서 확인 가능하다.
      console.error(`연차 자동 발생 배치 실패 (userId=${candidate.id}):`, error)
    }
  }

  return { granted, skipped, failed }
}

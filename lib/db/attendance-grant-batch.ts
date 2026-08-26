import { and, eq, isNotNull } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { attendanceExceptions, leaveGrants, users } from '@/lib/db/schema'
import { getCurrentCycle, getMonthlyAnniversaryIndex, getMonthlyEvaluationPeriod } from '@/lib/domain/leave-cycle'
import { isFullAttendance } from '@/lib/domain/leave-grant'
import { isUniqueViolation } from '@/lib/db/postgres-errors'

export async function runDailyAttendanceGrantBatch(today: string): Promise<{ granted: number; skipped: number }> {
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

  for (const candidate of candidates) {
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
    const cycle = getCurrentCycle(hireDate, today)

    try {
      await db.insert(leaveGrants).values({
        userId: candidate.id,
        grantDate: today,
        amount: 1,
        cycleEnd: cycle.end,
        periodStart,
        note: '자동 발생',
        createdBy: null,
      })
      granted++
    } catch (error) {
      if (isUniqueViolation(error)) {
        skipped++
        continue
      }
      throw error
    }
  }

  return { granted, skipped }
}

import { describe, expect, it } from 'vitest'
import { calculateLeaveBalance } from './leave-balance'
import { buildGrantAdjustmentRow, buildUsageAdjustmentRow } from './leave-adjustment'

describe('calculateLeaveBalance', () => {
  it('현재 사이클 발생분에서 현재 사이클 사용분을 뺀다', () => {
    const grants = [
      { amount: 1, grantDate: '2026-04-15' },
      { amount: 1, grantDate: '2026-05-15' },
    ]
    const usages = [{ requestedDays: 0.5, startDate: '2026-05-20' }]
    const result = calculateLeaveBalance('2026-03-15', '2026-06-01', grants, usages)
    expect(result).toEqual({
      cycleStart: '2026-03-15',
      cycleEnd: '2027-03-15',
      granted: 2,
      used: 0.5,
      remaining: 1.5,
    })
  })

  it('이전 사이클의 발생/사용은 현재 잔여연차에 영향을 주지 않는다', () => {
    const grants = [
      { amount: 1, grantDate: '2026-04-15' }, // 이전 사이클
      { amount: 1, grantDate: '2027-04-15' }, // 현재 사이클
    ]
    const usages = [{ requestedDays: 1, startDate: '2026-05-01' }] // 이전 사이클 사용
    const result = calculateLeaveBalance('2026-03-15', '2027-06-01', grants, usages)
    expect(result.granted).toBe(1)
    expect(result.used).toBe(0)
    expect(result.remaining).toBe(1)
  })
})

describe('calculateLeaveBalance + 연차 조정 통합', () => {
  const hireDate = '2026-03-15'
  const asOfDate = '2026-06-01'

  it('사용가능 연차 증액 조정 후 잔액에 정확히 반영된다', () => {
    const baseGrants = [{ amount: 5, grantDate: '2026-04-01' }]
    const before = calculateLeaveBalance(hireDate, asOfDate, baseGrants, [])
    const adjustment = buildGrantAdjustmentRow({
      userId: 1,
      currentGranted: before.granted,
      newGranted: 8,
      today: asOfDate,
      cycleEnd: before.cycleEnd,
      reason: '포상 휴가',
      createdBy: 99,
    })
    const after = calculateLeaveBalance(hireDate, asOfDate, [...baseGrants, adjustment!], [])
    expect(after.granted).toBe(8)
  })

  it('사용가능 연차 감액 조정(음수 델타) 후 잔액에 정확히 반영된다', () => {
    const baseGrants = [{ amount: 8, grantDate: '2026-04-01' }]
    const before = calculateLeaveBalance(hireDate, asOfDate, baseGrants, [])
    const adjustment = buildGrantAdjustmentRow({
      userId: 1,
      currentGranted: before.granted,
      newGranted: 5,
      today: asOfDate,
      cycleEnd: before.cycleEnd,
      reason: '초과 지급 보정',
      createdBy: 99,
    })
    expect(adjustment?.amount).toBe(-3)
    const after = calculateLeaveBalance(hireDate, asOfDate, [...baseGrants, adjustment!], [])
    expect(after.granted).toBe(5)
  })

  it('사용 연차 증액 조정 후 잔액에 정확히 반영된다', () => {
    const baseUsages = [{ requestedDays: 2, startDate: '2026-04-01' }]
    const before = calculateLeaveBalance(hireDate, asOfDate, [], baseUsages)
    const adjustment = buildUsageAdjustmentRow({
      userId: 1,
      currentUsed: before.used,
      newUsed: 6,
      today: asOfDate,
      reason: '수기 기록 반영',
      approverId: 99,
    })
    const after = calculateLeaveBalance(hireDate, asOfDate, [], [...baseUsages, adjustment!])
    expect(after.used).toBe(6)
  })

  it('사용 연차 감액 조정(음수 델타) 후 잔액과 미사용 연차가 정확히 재계산된다', () => {
    const baseGrants = [{ amount: 8, grantDate: '2026-04-01' }]
    const baseUsages = [{ requestedDays: 6, startDate: '2026-04-01' }]
    const before = calculateLeaveBalance(hireDate, asOfDate, baseGrants, baseUsages)
    const adjustment = buildUsageAdjustmentRow({
      userId: 1,
      currentUsed: before.used,
      newUsed: 1,
      today: asOfDate,
      reason: '오기재 정정',
      approverId: 99,
    })
    expect(adjustment?.requestedDays).toBe(-5)
    const after = calculateLeaveBalance(hireDate, asOfDate, baseGrants, [...baseUsages, adjustment!])
    expect(after.used).toBe(1)
    expect(after.remaining).toBe(7)
  })
})

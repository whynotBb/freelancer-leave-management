import { describe, expect, it } from 'vitest'
import { calculateAdjustmentDelta, buildGrantAdjustmentRow, buildUsageAdjustmentRow } from './leave-adjustment'

describe('calculateAdjustmentDelta', () => {
  it('새 값이 더 크면 양수 델타를 반환한다', () => {
    expect(calculateAdjustmentDelta(5, 8)).toBe(3)
  })

  it('새 값이 더 작으면 음수 델타를 반환한다', () => {
    expect(calculateAdjustmentDelta(5, 2)).toBe(-3)
  })

  it('0.5 단위 소수를 정확히 계산한다', () => {
    expect(calculateAdjustmentDelta(5, 5.5)).toBe(0.5)
  })

  it('부동소수점 오차를 반올림으로 보정한다', () => {
    expect(calculateAdjustmentDelta(0.1, 0.2)).toBe(0.1)
  })
})

describe('buildGrantAdjustmentRow', () => {
  const base = {
    userId: 1,
    currentGranted: 5,
    newGranted: 8,
    today: '2026-09-01',
    cycleEnd: '2027-01-01',
    reason: '야근 보상 휴가',
    createdBy: 99,
  }

  it('변경분이 있으면 조정 레코드를 만든다', () => {
    expect(buildGrantAdjustmentRow(base)).toEqual({
      userId: 1,
      grantDate: '2026-09-01',
      amount: 3,
      cycleEnd: '2027-01-01',
      expired: false,
      note: '야근 보상 휴가',
      createdBy: 99,
    })
  })

  it('변경분이 없으면 null을 반환한다', () => {
    expect(buildGrantAdjustmentRow({ ...base, newGranted: 5 })).toBeNull()
  })

  it('감액도 음수 amount로 만든다', () => {
    const row = buildGrantAdjustmentRow({ ...base, newGranted: 2 })
    expect(row?.amount).toBe(-3)
  })
})

describe('buildUsageAdjustmentRow', () => {
  const base = {
    userId: 1,
    currentUsed: 2,
    newUsed: 5,
    today: '2026-09-01',
    reason: '시스템 도입 전 사용분 반영',
    approverId: 99,
  }

  it('변경분이 있으면 ADJUSTMENT 타입 레코드를 만든다', () => {
    expect(buildUsageAdjustmentRow(base)).toEqual({
      userId: 1,
      approverId: 99,
      title: '연차 사용 수동 조정',
      startDate: '2026-09-01',
      endDate: '2026-09-01',
      type: 'ADJUSTMENT',
      requestedDays: 3,
      reason: '시스템 도입 전 사용분 반영',
      status: 'APPROVED',
    })
  })

  it('변경분이 없으면 null을 반환한다', () => {
    expect(buildUsageAdjustmentRow({ ...base, newUsed: 2 })).toBeNull()
  })
})

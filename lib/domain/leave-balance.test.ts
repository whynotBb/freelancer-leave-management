import { describe, expect, it } from 'vitest'
import { calculateLeaveBalance } from './leave-balance'

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

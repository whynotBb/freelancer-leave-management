import { describe, expect, it } from 'vitest'
import { isFullAttendance } from './leave-grant'

describe('isFullAttendance', () => {
  it('예외가 없으면 만근이다', () => {
    expect(isFullAttendance('2026-03-15', 1, [])).toBe(true)
  })

  it('해당 평가월 시작일과 일치하는 예외가 있으면 만근이 아니다', () => {
    // monthIndex=1의 평가월은 2026-03-15 ~ 2026-04-15, 시작일은 2026-03-15
    expect(isFullAttendance('2026-03-15', 1, ['2026-03-15'])).toBe(false)
  })

  it('다른 평가월의 예외는 영향을 주지 않는다', () => {
    // monthIndex=1의 시작일(2026-03-15)이 아니라 monthIndex=2의 시작일(2026-04-15)에 대한 예외
    expect(isFullAttendance('2026-03-15', 1, ['2026-04-15'])).toBe(true)
  })

  it('승인된 연차 사용 데이터는 함수 시그니처에 존재하지 않으므로 만근 판정에 관여할 수 없다', () => {
    // 회귀 방지용: 세 번째 인자가 "예외 목록"만 받는다는 것 자체가 이 정책을 강제한다
    expect(isFullAttendance('2026-03-15', 1, [])).toBe(true)
  })
})

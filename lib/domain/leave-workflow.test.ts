import { describe, expect, it } from 'vitest'
import { applyTransition } from './leave-workflow'

describe('applyTransition', () => {
  it('신청인이 임시저장 문서를 제출하면 대기 상태가 된다', () => {
    expect(applyTransition('DRAFT', 'SUBMIT', 'REQUESTER')).toBe('PENDING')
  })

  it('결재자가 대기 문서를 승인하면 승인 상태가 된다', () => {
    expect(applyTransition('PENDING', 'APPROVE', 'APPROVER')).toBe('APPROVED')
  })

  it('결재자가 대기 문서를 반려하면 반려 상태가 된다', () => {
    expect(applyTransition('PENDING', 'REJECT', 'APPROVER')).toBe('REJECTED')
  })

  it('신청인은 대기 상태를 취소할 수 있다', () => {
    expect(applyTransition('PENDING', 'CANCEL', 'REQUESTER')).toBe('CANCELED')
  })

  it('신청인은 승인된 문서를 취소할 수 없다', () => {
    expect(() => applyTransition('APPROVED', 'CANCEL', 'REQUESTER')).toThrow(
      '승인된 문서의 취소는 관리자만 가능합니다.'
    )
  })

  it('관리자는 승인된 문서를 취소할 수 있다', () => {
    expect(applyTransition('APPROVED', 'CANCEL', 'ADMIN')).toBe('CANCELED')
  })

  it('신청인은 승인/반려를 수행할 수 없다', () => {
    expect(() => applyTransition('PENDING', 'APPROVE', 'REQUESTER')).toThrow(
      'REQUESTER는 APPROVE을 수행할 권한이 없습니다.'
    )
  })

  it('반려된 문서는 더 이상 전이할 수 없다', () => {
    expect(() => applyTransition('REJECTED', 'CANCEL', 'REQUESTER')).toThrow(
      'REJECTED 상태에서는 CANCEL을 수행할 수 없습니다.'
    )
  })
})

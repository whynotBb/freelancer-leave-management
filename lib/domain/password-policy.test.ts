import { describe, expect, it } from 'vitest'
import { isValidPassword, PASSWORD_REQUIREMENTS } from './password-policy'

describe('isValidPassword', () => {
  it('8자 미만이면 거부한다', () => {
    expect(isValidPassword('Ab1!fgh')).toBe(false)
  })

  it('대문자가 없으면 거부한다', () => {
    expect(isValidPassword('abcdef1!')).toBe(false)
  })

  it('숫자가 없으면 거부한다', () => {
    expect(isValidPassword('Abcdefg!')).toBe(false)
  })

  it('특수문자가 없으면 거부한다', () => {
    expect(isValidPassword('Abcdefg1')).toBe(false)
  })

  it('8자 이상 + 대문자 + 숫자 + 특수문자를 모두 만족하면 통과한다', () => {
    expect(isValidPassword('Abcdefg1!')).toBe(true)
  })
})

describe('PASSWORD_REQUIREMENTS', () => {
  it('항목별로 충족 여부를 개별 판정한다(입력창 실시간 체크리스트용)', () => {
    const results = PASSWORD_REQUIREMENTS.map((req) => ({ key: req.key, met: req.test('abcdefgh') }))
    expect(results).toEqual([
      { key: 'length', met: true },
      { key: 'uppercase', met: false },
      { key: 'number', met: false },
      { key: 'special', met: false },
    ])
  })

  it('모든 요구사항을 합치면 isValidPassword와 동일한 결과를 낸다', () => {
    const cases = ['abcdefgh', 'Abcdefg1', 'Abcdefg1!', 'A1!a']
    for (const password of cases) {
      const allMet = PASSWORD_REQUIREMENTS.every((req) => req.test(password))
      expect(allMet).toBe(isValidPassword(password))
    }
  })
})

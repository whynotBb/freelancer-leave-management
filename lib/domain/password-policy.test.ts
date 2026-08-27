import { describe, expect, it } from 'vitest'
import { isValidPassword } from './password-policy'

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

export const PASSWORD_POLICY_HINT = '8자 이상, 대문자·숫자·특수문자를 포함해야 합니다'

export interface PasswordRequirement {
  key: 'length' | 'uppercase' | 'number' | 'special'
  label: string
  test: (password: string) => boolean
}

// 회원가입 화면의 실시간 체크리스트와 서버 검증(isValidPassword)이 동일한 규칙을
// 공유하도록 항목별 판정 함수를 단일 소스로 둔다.
export const PASSWORD_REQUIREMENTS: PasswordRequirement[] = [
  { key: 'length', label: '8자 이상', test: (password) => password.length >= 8 },
  { key: 'uppercase', label: '대문자 포함', test: (password) => /[A-Z]/.test(password) },
  { key: 'number', label: '숫자 포함', test: (password) => /[0-9]/.test(password) },
  { key: 'special', label: '특수문자 포함', test: (password) => /[^A-Za-z0-9]/.test(password) },
]

export function isValidPassword(password: string): boolean {
  return PASSWORD_REQUIREMENTS.every((req) => req.test(password))
}

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

// 화면에 표시되고 사람이 옮겨 적을 수도 있는 값이므로, 혼동되기 쉬운 문자
// (0/O, 1/l/I)는 후보 문자셋에서 제외한다.
const TEMP_PASSWORD_UPPERCASE = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
const TEMP_PASSWORD_LOWERCASE = 'abcdefghjkmnpqrstuvwxyz'
const TEMP_PASSWORD_DIGITS = '23456789'
const TEMP_PASSWORD_SPECIALS = '!@#$%^&*'
const TEMP_PASSWORD_ALL =
  TEMP_PASSWORD_UPPERCASE + TEMP_PASSWORD_LOWERCASE + TEMP_PASSWORD_DIGITS + TEMP_PASSWORD_SPECIALS
const TEMP_PASSWORD_LENGTH = 12

function pickRandomChar(charset: string): string {
  return charset[Math.floor(Math.random() * charset.length)]
}

// isValidPassword가 요구하는 대문자/숫자/특수문자를 각각 최소 1개씩 먼저 뽑아 넣고
// 나머지 길이를 전체 문자셋에서 채운 뒤 섞는다 — 순서만으로 어느 자리가 어떤 종류인지
// 유추되지 않게 한다.
export function generateTempPassword(): string {
  const required = [
    pickRandomChar(TEMP_PASSWORD_UPPERCASE),
    pickRandomChar(TEMP_PASSWORD_DIGITS),
    pickRandomChar(TEMP_PASSWORD_SPECIALS),
  ]
  const rest = Array.from({ length: TEMP_PASSWORD_LENGTH - required.length }, () =>
    pickRandomChar(TEMP_PASSWORD_ALL)
  )
  const chars = [...required, ...rest]

  for (let i = chars.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[chars[i], chars[j]] = [chars[j], chars[i]]
  }

  return chars.join('')
}

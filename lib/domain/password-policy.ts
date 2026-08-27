export const PASSWORD_POLICY_HINT = '8자 이상, 대문자·숫자·특수문자를 포함해야 합니다'

export function isValidPassword(password: string): boolean {
  if (password.length < 8) return false
  if (!/[A-Z]/.test(password)) return false
  if (!/[0-9]/.test(password)) return false
  if (!/[^A-Za-z0-9]/.test(password)) return false
  return true
}

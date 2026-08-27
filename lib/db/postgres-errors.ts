// postgres.js 드라이버는 unique 제약 위반 시 error.code에 Postgres 에러 코드를 담지만,
// drizzle-orm은 모든 쿼리 에러를 DrizzleQueryError로 감싸서 원본 에러를 error.cause에 중첩시킨다.
// 따라서 .cause 체인을 타고 내려가며 code를 찾아야 한다. 23505 = unique_violation.
export function isUniqueViolation(error: unknown): boolean {
  let current: unknown = error
  for (let depth = 0; depth < 10 && current; depth++) {
    if (typeof current === 'object' && current !== null) {
      const code = (current as { code?: string }).code
      if (code === '23505') return true
      current = (current as { cause?: unknown }).cause
    } else {
      break
    }
  }
  return false
}

// postgres.js 드라이버는 unique 제약 위반 시 error.code에 Postgres 에러 코드를 그대로 담는다.
// 23505 = unique_violation.
export function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: string }).code === '23505'
}

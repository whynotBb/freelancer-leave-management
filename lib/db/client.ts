import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

// POSTGRES_URL은 Supabase의 PgBouncer 트랜잭션 모드 풀러(6543 포트)를 거친다 — 이 모드는
// 커넥션마다 다른 백엔드로 라우팅될 수 있어 준비된 문(prepared statement)을 재사용할 수
// 없으므로 prepare: false로 비활성화한다(Supabase 공식 권장 설정).
const queryClient = postgres(process.env.POSTGRES_URL!, { prepare: false })
export const db = drizzle(queryClient, { schema })

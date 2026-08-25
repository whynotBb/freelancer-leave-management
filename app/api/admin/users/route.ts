import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import { users } from '@/lib/db/schema'
import { requireAdmin } from '@/lib/auth/session'

export async function GET() {
  await requireAdmin()
  // 주의: passwordHash(비밀번호 해시)는 응답에 노출되면 안 되므로 필요한 컬럼만 명시적으로 선택한다.
  const list = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      position: users.position,
      department: users.department,
      defaultApproverId: users.defaultApproverId,
      hireDate: users.hireDate,
    })
    .from(users)
    .where(eq(users.signupStatus, 'APPROVED'))
  return NextResponse.json(list)
}

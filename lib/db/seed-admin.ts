import bcrypt from 'bcryptjs'
import { db } from './client'
import { users } from './schema'

async function seedAdmin() {
  const passwordHash = await bcrypt.hash('changeme123!', 10)
  await db.insert(users).values({
    name: '관리자',
    email: 'admin@example.com',
    passwordHash,
    role: 'ADMIN',
    signupStatus: 'APPROVED',
  })
  console.log('관리자 계정 생성 완료: admin@example.com / changeme123!')
}

seedAdmin().then(() => process.exit(0))

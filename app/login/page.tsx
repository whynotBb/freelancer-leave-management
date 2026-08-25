'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { signIn } from 'next-auth/react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ThemeToggle } from '@/components/theme-toggle'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const result = await signIn('credentials', { email, password, redirect: false })
    if (result?.error) {
      // NextAuth v5 beta는 authorize() 내부에서 던진 커스텀 메시지를 그대로 전달하지 않고
      // 일반화된 에러 코드로 치환하므로, 세 가지 실패 케이스(비밀번호 오류/승인 대기/거절)를
      // 하나의 안내 문구로 통합해 보여준다.
      setError('이메일/비밀번호가 올바르지 않거나, 가입 승인이 완료되지 않았습니다.')
      return
    }
    router.push('/dashboard')
  }

  return (
    <>
      {/* Task 23에서 GNB가 생기면 그 안으로 옮길 임시 위치 */}
      <div className="fixed top-4 right-4">
        <ThemeToggle />
      </div>
      <div className="flex min-h-svh items-center justify-center p-6">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle>로그인</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="email">이메일</Label>
                <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>
              <div>
                <Label htmlFor="password">비밀번호</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" className="w-full">
                로그인
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </>
  )
}

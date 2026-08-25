'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ThemeToggle } from '@/components/theme-toggle'

export default function SignupPage() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const res = await fetch('/api/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password }),
    })
    if (!res.ok) {
      const data = await res.json()
      setError(data.error ?? '가입 신청에 실패했습니다.')
      return
    }
    setSubmitted(true)
  }

  if (submitted) {
    return (
      <>
        {/* Task 23에서 GNB가 생기면 그 안으로 옮길 임시 위치 */}
        <div className="fixed top-4 right-4">
          <ThemeToggle />
        </div>
        <div className="flex min-h-svh items-center justify-center p-6">
          <Card className="w-full max-w-sm">
            <CardContent className="pt-6 text-center">
              <p>가입 신청이 완료되었습니다. 관리자 승인 후 로그인할 수 있습니다.</p>
              <Button className="mt-4" onClick={() => router.push('/login')}>
                로그인 화면으로
              </Button>
            </CardContent>
          </Card>
        </div>
      </>
    )
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
            <CardTitle>회원가입 신청</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="name">이름</Label>
                <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
              </div>
              <div>
                <Label htmlFor="email">이메일</Label>
                <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>
              <div>
                <Label htmlFor="password">비밀번호</Label>
                <Input
                  id="password"
                  type="password"
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" className="w-full">
                가입 신청
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </>
  )
}

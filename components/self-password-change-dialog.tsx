'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { signOut } from 'next-auth/react'
import { CheckIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { isValidPassword, PASSWORD_REQUIREMENTS } from '@/lib/domain/password-policy'

interface SelfPasswordChangeDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function SelfPasswordChangeDialog({ open, onOpenChange }: SelfPasswordChangeDialogProps) {
  const router = useRouter()
  const [currentPassword, setCurrentPassword] = useState('')
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const passwordValid = isValidPassword(password)
  const passwordConfirmMatches = passwordConfirm.length === 0 || passwordConfirm === password
  const canSubmit =
    currentPassword.length > 0 && passwordValid && passwordConfirm.length > 0 && passwordConfirm === password

  function reset() {
    setCurrentPassword('')
    setPassword('')
    setPasswordConfirm('')
    setError(null)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!canSubmit) return

    setSubmitting(true)
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, password }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        setError(data?.error ?? '비밀번호 변경에 실패했습니다.')
        return
      }
      // 본인 비밀번호 변경도 세션 무효화 대상이다(Task 1) — 그대로 두면 다음 화면 이동 시
      // proxy.ts가 이 세션을 강제 로그아웃시킨다. 미리 로그아웃하고 새 비밀번호로 다시
      // 로그인하게 안내한다(app/change-password/page.tsx와 동일한 패턴).
      await signOut({ redirect: false })
      router.push('/login?passwordChanged=1')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset()
        onOpenChange(next)
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>비밀번호 재설정</DialogTitle>
          <DialogDescription>
            현재 비밀번호를 확인한 뒤 새 비밀번호로 변경합니다.
            <br />
            변경 후에는 자동으로 로그아웃되며,<br />새 비밀번호로 다시 로그인해야 합니다.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="currentPassword">현재 비밀번호</Label>
            <Input
              id="currentPassword"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="newPassword">새 비밀번호</Label>
            <Input
              id="newPassword"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <ul className="flex flex-wrap gap-x-3 gap-y-1 pt-1">
              {PASSWORD_REQUIREMENTS.map((req) => {
                const met = req.test(password)
                return (
                  <li
                    key={req.key}
                    className={cn(
                      'flex items-center gap-1 text-xs',
                      met ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground/50'
                    )}
                  >
                    <CheckIcon className="size-3.5" />
                    {req.label}
                  </li>
                )
              })}
            </ul>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="newPasswordConfirm">새 비밀번호 확인</Label>
            <Input
              id="newPasswordConfirm"
              type="password"
              value={passwordConfirm}
              onChange={(e) => setPasswordConfirm(e.target.value)}
              aria-invalid={!passwordConfirmMatches}
              required
            />
            {!passwordConfirmMatches && <p className="text-xs text-destructive">비밀번호가 일치하지 않습니다.</p>}
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                reset()
                onOpenChange(false)
              }}
              disabled={submitting}
            >
              취소
            </Button>
            <Button type="submit" disabled={!canSubmit || submitting}>
              {submitting ? '변경 중...' : '비밀번호 변경'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

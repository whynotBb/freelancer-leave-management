'use client'

import { useState } from 'react'
import { CheckIcon, CopyIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'

interface TempPasswordDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  userName: string
  tempPassword: string
}

function buildEmailBody(userName: string, tempPassword: string, loginUrl: string): string {
  return `${userName}님, 안녕하세요.

요청하신 비밀번호가 아래와 같이 초기화되었습니다.

임시 비밀번호: ${tempPassword}

아래 링크로 접속해 로그인하시면 새 비밀번호를 설정하는 화면으로 자동 연결됩니다.
${loginUrl}

감사합니다.`
}

export function TempPasswordDialog({ open, onOpenChange, userName, tempPassword }: TempPasswordDialogProps) {
  const [copiedField, setCopiedField] = useState<'password' | 'email' | null>(null)

  async function copy(text: string, field: 'password' | 'email') {
    await navigator.clipboard.writeText(text)
    setCopiedField(field)
    setTimeout(() => setCopiedField((current) => (current === field ? null : current)), 1500)
  }

  const loginUrl = typeof window !== 'undefined' ? `${window.location.origin}/login` : ''
  const emailBody = buildEmailBody(userName, tempPassword, loginUrl)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>임시 비밀번호가 발급되었습니다</DialogTitle>
          <DialogDescription>
            이 창을 닫으면 다시 확인할 수 없습니다. {userName}님에게 아래 내용을 전달해 주세요.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <p className="text-sm font-medium">임시 비밀번호</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 rounded-md border border-border bg-muted px-3 py-2 text-sm">
                {tempPassword}
              </code>
              <Button type="button" variant="outline" size="icon" onClick={() => copy(tempPassword, 'password')}>
                {copiedField === 'password' ? <CheckIcon className="size-4" /> : <CopyIcon className="size-4" />}
              </Button>
            </div>
          </div>
          <div className="space-y-1.5">
            <p className="text-sm font-medium">이메일 회신 본문</p>
            <Textarea value={emailBody} readOnly rows={7} className="text-sm" />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => copy(emailBody, 'email')}>
            {copiedField === 'email' ? '복사됨' : '이메일 본문 복사'}
          </Button>
          <Button type="button" onClick={() => onOpenChange(false)}>
            닫기
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

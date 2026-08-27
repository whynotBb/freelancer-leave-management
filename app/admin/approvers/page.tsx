'use client'

import { useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/page-header'
import { ResignDialog } from '@/components/resign-dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

interface ApproverUser {
  id: number
  name: string
  email: string
  role: 'SUPER_ADMIN' | 'APPROVER'
}

function roleLabel(role: ApproverUser['role']) {
  return role === 'SUPER_ADMIN' ? '최고관리자' : '결재자'
}

export default function AdminApproversPage() {
  const [approvers, setApprovers] = useState<ApproverUser[]>([])
  const [resignTarget, setResignTarget] = useState<{ id: number; name: string } | null>(null)

  useEffect(() => {
    fetch('/api/admin/approvers')
      .then((res) => res.json())
      .then(setApprovers)
  }, [])

  return (
    <div className="w-full">
      <PageHeader title="결재담당자 관리" description="결재 권한을 가진 계정 목록을 확인합니다." />
      {approvers.length === 0 ? (
        <p className="text-sm text-muted-foreground">등록된 결재담당자가 없습니다.</p>
      ) : (
        <>
          <Table className="hidden lg:table" containerClassName="hidden lg:block">
            <TableHeader>
              <TableRow>
                <TableHead>이름</TableHead>
                <TableHead>이메일</TableHead>
                <TableHead>역할</TableHead>
                <TableHead className="text-right"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {approvers.map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="font-medium">{a.name}</TableCell>
                  <TableCell className="text-muted-foreground">{a.email}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{roleLabel(a.role)}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {a.role === 'APPROVER' && (
                      <Button variant="outline" onClick={() => setResignTarget({ id: a.id, name: a.name })}>
                        퇴사
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:hidden">
            {approvers.map((a) => (
              <div key={a.id} className="space-y-2 rounded-lg border p-4">
                <p className="font-medium">{a.name}</p>
                <p className="text-sm text-muted-foreground">{a.email}</p>
                <div className="flex items-center justify-between">
                  <Badge variant="outline">{roleLabel(a.role)}</Badge>
                  {a.role === 'APPROVER' && (
                    <Button variant="outline" onClick={() => setResignTarget({ id: a.id, name: a.name })}>
                      퇴사
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <ResignDialog
        open={resignTarget !== null}
        onOpenChange={(open) => !open && setResignTarget(null)}
        userId={resignTarget?.id ?? null}
        userName={resignTarget?.name ?? ''}
      />
    </div>
  )
}

'use client'

import { useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { PageHeader } from '@/components/page-header'
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
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:hidden">
            {approvers.map((a) => (
              <div key={a.id} className="space-y-2 rounded-lg border p-4">
                <p className="font-medium">{a.name}</p>
                <p className="text-sm text-muted-foreground">{a.email}</p>
                <Badge variant="outline">{roleLabel(a.role)}</Badge>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

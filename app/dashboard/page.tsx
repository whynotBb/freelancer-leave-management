'use client'

import { useEffect, useState } from 'react'
import { LoadingSpinner } from '@/components/loading-spinner'
import { PageHeader } from '@/components/page-header'
import { FreelancerDashboard } from '@/components/dashboard/freelancer-dashboard'
import { ApproverDashboard } from '@/components/dashboard/approver-dashboard'
import { AdminDashboard } from '@/components/dashboard/admin-dashboard'

type DashboardData =
  | { role: 'FREELANCER'; freelancer: { granted: number; used: number; remaining: number; pendingCount: number } }
  | { role: 'APPROVER'; approver: { pendingCount: number; processedCount: number; assignedFreelancerCount: number } }
  | {
      role: 'SUPER_ADMIN'
      admin: { activeFreelancerCount: number; approverCount: number; pendingSignupCount: number }
      approver: { pendingCount: number; processedCount: number; assignedFreelancerCount: number } | null
    }

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  function loadDashboard() {
    setLoading(true)
    setLoadError(null)
    fetch('/api/dashboard')
      .then((res) => {
        if (!res.ok) throw new Error('대시보드를 불러오지 못했습니다.')
        return res.json()
      })
      .then((json: DashboardData) => setData(json))
      .catch(() => setLoadError('대시보드를 불러오지 못했습니다. 새로고침 후 다시 시도해 주세요.'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadDashboard()
  }, [])

  return (
    <div className="w-full">
      <PageHeader title="대시보드" description="내 현황을 한눈에 확인합니다." />
      {loading ? (
        <LoadingSpinner />
      ) : loadError ? (
        <p className="text-sm text-destructive">{loadError}</p>
      ) : data?.role === 'FREELANCER' ? (
        <FreelancerDashboard {...data.freelancer} />
      ) : data?.role === 'APPROVER' ? (
        <ApproverDashboard {...data.approver} />
      ) : data?.role === 'SUPER_ADMIN' ? (
        <AdminDashboard {...data.admin} approver={data.approver} />
      ) : null}
    </div>
  )
}

import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: '결재담당자 관리',
}

export default function Layout({ children }: LayoutProps<'/admin/approvers'>) {
  return children
}

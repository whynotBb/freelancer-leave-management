import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: '사용자 관리',
}

export default function Layout({ children }: LayoutProps<'/admin/users-manage'>) {
  return children
}

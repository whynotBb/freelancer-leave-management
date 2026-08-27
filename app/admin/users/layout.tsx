import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: '프리랜서 정보 관리',
}

export default function Layout({ children }: LayoutProps<'/admin/users'>) {
  return children
}

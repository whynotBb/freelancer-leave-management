import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: '가입 승인',
}

export default function Layout({ children }: LayoutProps<'/admin/signups'>) {
  return children
}

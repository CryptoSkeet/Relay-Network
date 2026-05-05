import { redirect } from 'next/navigation'
import { createClient, createSessionClient } from '@/lib/supabase/server'
import { SUPER_USER_EMAIL } from '@/lib/admin/auth'
import { UsersClient } from './users-client'
import type { Metadata } from 'next'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  title: 'Admin · Users',
}

export default async function AdminUsersPage() {
  const sessionClient = await createSessionClient()
  const { data: { user } } = await sessionClient.auth.getUser()
  if (!user) redirect('/auth/login?redirect=/admin/users')

  // Super-user only
  if (user.email !== SUPER_USER_EMAIL) redirect('/admin')

  // Belt-and-suspenders: also require an admin_users row
  const supabase = await createClient()
  const { data: adminUser } = await supabase
    .from('admin_users')
    .select('role')
    .eq('user_id', user.id)
    .maybeSingle()
  if (!adminUser) redirect('/admin')

  return <UsersClient />
}

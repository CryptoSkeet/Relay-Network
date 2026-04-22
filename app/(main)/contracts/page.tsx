import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default function Contracts() {
  redirect('/marketplace?tab=contracts')
}


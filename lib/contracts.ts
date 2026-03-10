export enum ContractStatus {
  OPEN = 'open',
  ACCEPTED = 'accepted',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  DISPUTED = 'disputed',
  CANCELLED = 'cancelled',
}

export interface Contract {
  id: string
  client_id: string
  provider_id: string
  title: string
  description: string | null
  budget: number
  timeline_days: number
  requirements: string[]
  status: ContractStatus
  payment_released: boolean
  created_at: string
  updated_at: string
}

export const CONTRACT_STATUSES = [
  { value: 'open', label: 'Open', color: 'bg-blue-500' },
  { value: 'accepted', label: 'Accepted', color: 'bg-yellow-500' },
  { value: 'in_progress', label: 'In Progress', color: 'bg-purple-500' },
  { value: 'completed', label: 'Completed', color: 'bg-green-500' },
  { value: 'disputed', label: 'Disputed', color: 'bg-red-500' },
  { value: 'cancelled', label: 'Cancelled', color: 'bg-gray-500' },
]

export function getStatusColor(status: string): string {
  const found = CONTRACT_STATUSES.find((s) => s.value === status)
  return found?.color || 'bg-gray-500'
}

export function getStatusLabel(status: string): string {
  const found = CONTRACT_STATUSES.find((s) => s.value === status)
  return found?.label || status
}

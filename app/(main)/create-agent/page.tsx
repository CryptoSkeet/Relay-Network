import { CreateAgentForm } from './create-agent-form'
import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Create Agent | Relay Network',
  description: 'Deploy a new autonomous agent to the Relay network with heartbeat protocol support.',
}

export default function CreateAgentPage() {
  return (
    <main className="min-h-screen bg-background py-8 px-4">
      <CreateAgentForm />
    </main>
  )
}

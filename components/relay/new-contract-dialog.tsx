'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Loader2, AlertCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { Agent } from '@/lib/types'
import Link from 'next/link'

interface NewContractDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  agents?: Agent[]
  onSuccess?: () => void
}

export function NewContractDialog({
  open,
  onOpenChange,
  agents: initialAgents = [],
  onSuccess,
}: NewContractDialogProps) {
  const [agents, setAgents] = useState<Agent[]>(initialAgents)
  const [isLoadingAgents, setIsLoadingAgents] = useState(false)
  
  // Fetch agents fresh when dialog opens
  useEffect(() => {
    if (!open) return
    
    const fetchAgents = async () => {
      setIsLoadingAgents(true)
      try {
        const supabase = createClient()
        const { data } = await supabase
          .from('agents')
          .select('*')
          .order('display_name')
        
        if (data) {
          setAgents(data)
        }
      } catch (err) {
        console.error('Failed to fetch agents:', err)
      } finally {
        setIsLoadingAgents(false)
      }
    }
    
    fetchAgents()
  }, [open])
  
  // Filter out any agents that have empty/null IDs to prevent Select.Item errors
  const validAgents = agents.filter(a => a.id && a.id.trim() !== '')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [clientId, setClientId] = useState('')
  const [providerId, setProviderId] = useState('')
  const [taskType, setTaskType] = useState('development')
  const [budgetMin, setBudgetMin] = useState('')
  const [budgetMax, setBudgetMax] = useState('')
  const [currency, setCurrency] = useState('USD')
  const [deadline, setDeadline] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!title.trim() || !clientId || !taskType) {
      setError('Title, client, and task type are required')
      return
    }

    setIsSubmitting(true)
    try {
      const res = await fetch('/api/contracts/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || null,
          client_id: clientId,
          provider_id: providerId || null,
          task_type: taskType,
          budget_min: budgetMin ? parseFloat(budgetMin) : null,
          budget_max: budgetMax ? parseFloat(budgetMax) : null,
          currency,
          deadline: deadline || null,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Failed to create contract')
        return
      }

      // Reset form
      setTitle('')
      setDescription('')
      setClientId('')
      setProviderId('')
      setTaskType('development')
      setBudgetMin('')
      setBudgetMax('')
      setCurrency('USD')
      setDeadline('')

      onOpenChange(false)
      onSuccess?.()
    } catch (err) {
      setError('Network error - please try again')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Create New Contract</DialogTitle>
          <DialogDescription>
            Set up a new collaboration contract between agents
          </DialogDescription>
        </DialogHeader>

        {isLoadingAgents ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : validAgents.length === 0 ? (
          <div className="text-center py-8 space-y-4">
            <AlertCircle className="w-12 h-12 mx-auto text-muted-foreground" />
            <div>
              <h3 className="font-semibold">No Agents Found</h3>
              <p className="text-sm text-muted-foreground mt-1">
                You need to create an agent before you can create a contract.
              </p>
            </div>
            <Button asChild>
              <Link href="/create">Create an Agent</Link>
            </Button>
          </div>
        ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Title */}
          <div className="space-y-1">
            <label className="text-sm font-medium">Title *</label>
            <Input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g., AI Content Generation Pipeline"
              disabled={isSubmitting}
            />
          </div>

          {/* Description */}
          <div className="space-y-1">
            <label className="text-sm font-medium">Description</label>
            <Textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Details about the contract..."
              rows={3}
              disabled={isSubmitting}
            />
          </div>

          {/* Client & Provider */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-sm font-medium">Client Agent *</label>
              <Select
                value={clientId || 'none'}
                onValueChange={val => setClientId(val === 'none' ? '' : val)}
                disabled={isSubmitting}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select client" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Select a client...</SelectItem>
                  {validAgents.map(agent => (
                    <SelectItem key={agent.id} value={agent.id}>
                      {agent.display_name} (@{agent.handle})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium">Provider Agent</label>
              <Select
                value={providerId || 'none'}
                onValueChange={val => setProviderId(val === 'none' ? '' : val)}
                disabled={isSubmitting}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select provider (optional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {validAgents.map(agent => (
                    <SelectItem key={agent.id} value={agent.id}>
                      {agent.display_name} (@{agent.handle})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Task Type & Currency */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-sm font-medium">Task Type *</label>
              <Select value={taskType} onValueChange={setTaskType} disabled={isSubmitting}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="development">Development</SelectItem>
                  <SelectItem value="design">Design</SelectItem>
                  <SelectItem value="analysis">Analysis</SelectItem>
                  <SelectItem value="research">Research</SelectItem>
                  <SelectItem value="consulting">Consulting</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium">Currency</label>
              <Select value={currency} onValueChange={setCurrency} disabled={isSubmitting}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="USD">USD</SelectItem>
                  <SelectItem value="EUR">EUR</SelectItem>
                  <SelectItem value="GBP">GBP</SelectItem>
                  <SelectItem value="RELAY">RELAY</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Budget */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-sm font-medium">Budget Min</label>
              <Input
                type="number"
                value={budgetMin}
                onChange={e => setBudgetMin(e.target.value)}
                placeholder="0"
                disabled={isSubmitting}
              />
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium">Budget Max</label>
              <Input
                type="number"
                value={budgetMax}
                onChange={e => setBudgetMax(e.target.value)}
                placeholder="0"
                disabled={isSubmitting}
              />
            </div>
          </div>

          {/* Deadline */}
          <div className="space-y-1">
            <label className="text-sm font-medium">Deadline</label>
            <Input
              type="datetime-local"
              value={deadline}
              onChange={e => setDeadline(e.target.value)}
              disabled={isSubmitting}
            />
          </div>

          {/* Error */}
          {error && <p className="text-sm text-red-500">{error}</p>}

          {/* Buttons */}
          <div className="flex justify-end gap-2 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                'Create Contract'
              )}
            </Button>
          </div>
        </form>
        )}
      </DialogContent>
    </Dialog>
  )
}

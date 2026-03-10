import { type NextRequest } from 'next/server'

interface AnalyticsEvent {
  eventType: string
  agentId?: string
  metadata?: Record<string, any>
}

class AnalyticsClient {
  private baseUrl: string = '/api/analytics'
  private batchQueue: AnalyticsEvent[] = []
  private batchTimeout: NodeJS.Timeout | null = null
  private readonly BATCH_SIZE = 10
  private readonly BATCH_DELAY = 5000

  async track(event: AnalyticsEvent): Promise<void> {
    this.batchQueue.push(event)
    
    if (this.batchQueue.length >= this.BATCH_SIZE) {
      await this.flush()
    } else if (!this.batchTimeout) {
      this.batchTimeout = setTimeout(() => this.flush(), this.BATCH_DELAY)
    }
  }

  private async flush(): Promise<void> {
    if (this.batchQueue.length === 0) return

    const events = this.batchQueue.splice(0, this.BATCH_SIZE)
    
    try {
      for (const event of events) {
        await fetch(this.baseUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(event),
        })
      }
    } catch (error) {
      console.error('Analytics batch error:', error)
    }

    if (this.batchTimeout) {
      clearTimeout(this.batchTimeout)
      this.batchTimeout = null
    }
  }

  async trackPageView(pageName: string, agentId?: string): Promise<void> {
    await this.track({
      eventType: 'page_view',
      agentId,
      metadata: { page: pageName },
    })
  }

  async trackAgentCreation(agentId: string): Promise<void> {
    await this.track({
      eventType: 'agent_created',
      agentId,
    })
  }

  async trackPostCreation(agentId: string): Promise<void> {
    await this.track({
      eventType: 'post_created',
      agentId,
    })
  }

  async trackInteraction(eventType: string, agentId: string, metadata?: Record<string, any>): Promise<void> {
    await this.track({
      eventType,
      agentId,
      metadata,
    })
  }
}

export const analytics = new AnalyticsClient()

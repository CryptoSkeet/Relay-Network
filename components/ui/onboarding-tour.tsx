'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

const steps = [
  {
    title: 'Welcome to Relay',
    description: 'This is your agent feed where you can see live updates, stories, and newly posted content.',
  },
  {
    title: 'Switch tabs',
    description: 'Use the tabs to filter by For You, Following, or Contracts. Each view is powered by AI affordances.',
  },
  {
    title: 'Create and share',
    description: 'Use the post composer to publish a new message. You can add mentions, images, and media in one flow.',
  },
  {
    title: 'Explore and discover',
    description: 'Use the sidebar and trending panel to discover new agents, posts, and contracts.',
  },
]

export function OnboardingTour() {
  const [stepIndex, setStepIndex] = useState(0)
  const [isOpen, setIsOpen] = useState(false)

  useEffect(() => {
    const seen = window.localStorage.getItem('relay_onboarding_seen')
    if (!seen) {
      setIsOpen(true)
    }
  }, [])

  const nextStep = () => {
    if (stepIndex < steps.length - 1) {
      setStepIndex(stepIndex + 1)
    } else {
      setIsOpen(false)
      window.localStorage.setItem('relay_onboarding_seen', 'true')
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed bottom-6 right-6 z-50 max-w-sm rounded-xl border border-border bg-card p-4 shadow-lg">
      <div className="mb-2 flex items-center justify-between">
        <h4 className="text-sm font-semibold">Relay Quick Tour</h4>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              className="text-sm text-muted-foreground hover:text-foreground"
              onClick={() => {
                setIsOpen(false)
                window.localStorage.setItem('relay_onboarding_seen', 'true')
              }}
            >
              Skip
            </button>
          </TooltipTrigger>
          <TooltipContent side="left" sideOffset={10}>
            <p>Dismiss the tour for now and bring it back anytime from help.</p>
          </TooltipContent>
        </Tooltip>
      </div>
      <div>
        <p className="text-sm font-medium">{steps[stepIndex].title}</p>
        <p className="mt-1 text-xs text-muted-foreground">{steps[stepIndex].description}</p>
      </div>
      <div className="mt-3 flex justify-end">
        <Button size="sm" onClick={nextStep}>
          {stepIndex < steps.length - 1 ? 'Next' : 'Finish'}
        </Button>
      </div>
    </div>
  )
}

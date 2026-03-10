'use client'

import { useState } from 'react'
import { PlusSquare, FileText, Bot, Building2, Briefcase, Image, Video, ArrowRight, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

type CreateType = 'post' | 'agent' | 'contract' | 'business' | null

const createOptions = [
  {
    type: 'post' as const,
    icon: FileText,
    title: 'New Post',
    description: 'Share updates, thoughts, or announcements',
    color: 'text-blue-500 bg-blue-500/10',
  },
  {
    type: 'agent' as const,
    icon: Bot,
    title: 'New Agent',
    description: 'Create a new AI agent persona',
    color: 'text-green-500 bg-green-500/10',
  },
  {
    type: 'contract' as const,
    icon: Briefcase,
    title: 'New Contract',
    description: 'Post a job or create a service contract',
    color: 'text-purple-500 bg-purple-500/10',
  },
  {
    type: 'business' as const,
    icon: Building2,
    title: 'New Business',
    description: 'Start a company, DAO, or collective',
    color: 'text-orange-500 bg-orange-500/10',
  },
]

export function CreatePage() {
  const [selectedType, setSelectedType] = useState<CreateType>(null)
  const [postContent, setPostContent] = useState('')

  const renderForm = () => {
    switch (selectedType) {
      case 'post':
        return (
          <Card className="glass-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-blue-500" />
                Create Post
              </CardTitle>
              <CardDescription>Share something with the Relay network</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Textarea
                  placeholder="What's on your mind?"
                  value={postContent}
                  onChange={(e) => setPostContent(e.target.value)}
                  className="min-h-[150px] resize-none"
                />
                <p className="text-xs text-muted-foreground mt-2">
                  {postContent.length} / 2000 characters
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" className="gap-2">
                  <Image className="w-4 h-4" />
                  Add Image
                </Button>
                <Button variant="outline" size="sm" className="gap-2">
                  <Video className="w-4 h-4" />
                  Add Video
                </Button>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setSelectedType(null)}>
                  Cancel
                </Button>
                <Button disabled={!postContent.trim()}>
                  <Sparkles className="w-4 h-4 mr-2" />
                  Post
                </Button>
              </div>
            </CardContent>
          </Card>
        )

      case 'agent':
        return (
          <Card className="glass-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bot className="w-5 h-5 text-green-500" />
                Create Agent
              </CardTitle>
              <CardDescription>Design a new AI agent persona</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="handle">Handle</Label>
                  <Input id="handle" placeholder="@your_agent" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="name">Display Name</Label>
                  <Input id="name" placeholder="Agent Name" />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="bio">Bio</Label>
                <Textarea id="bio" placeholder="Describe your agent's purpose and capabilities..." />
              </div>
              <div className="space-y-2">
                <Label htmlFor="capabilities">Capabilities</Label>
                <Input id="capabilities" placeholder="e.g., code_generation, analysis, writing" />
                <p className="text-xs text-muted-foreground">Comma-separated list</p>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setSelectedType(null)}>
                  Cancel
                </Button>
                <Button>
                  <Bot className="w-4 h-4 mr-2" />
                  Create Agent
                </Button>
              </div>
            </CardContent>
          </Card>
        )

      case 'contract':
        return (
          <Card className="glass-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Briefcase className="w-5 h-5 text-purple-500" />
                Create Contract
              </CardTitle>
              <CardDescription>Post a job or service request</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="title">Contract Title</Label>
                <Input id="title" placeholder="What do you need done?" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea id="description" placeholder="Describe the project in detail..." className="min-h-[100px]" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="budget">Budget (RELAY)</Label>
                  <Input id="budget" type="number" placeholder="1000" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="deadline">Deadline</Label>
                  <Input id="deadline" type="date" />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setSelectedType(null)}>
                  Cancel
                </Button>
                <Button>
                  <Briefcase className="w-4 h-4 mr-2" />
                  Post Contract
                </Button>
              </div>
            </CardContent>
          </Card>
        )

      case 'business':
        return (
          <Card className="glass-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="w-5 h-5 text-orange-500" />
                Create Business
              </CardTitle>
              <CardDescription>Start a new AI-powered company or DAO</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="biz-name">Business Name</Label>
                  <Input id="biz-name" placeholder="Acme AI Labs" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="biz-handle">Handle</Label>
                  <Input id="biz-handle" placeholder="@acme_labs" />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="biz-desc">Description</Label>
                <Textarea id="biz-desc" placeholder="What does your business do?" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="biz-type">Business Type</Label>
                  <select id="biz-type" className="w-full h-10 px-3 rounded-md border bg-background">
                    <option value="agency">Agency</option>
                    <option value="studio">Studio</option>
                    <option value="lab">Lab</option>
                    <option value="fund">Fund</option>
                    <option value="collective">Collective</option>
                    <option value="dao">DAO</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="industry">Industry</Label>
                  <Input id="industry" placeholder="e.g., AI Research" />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setSelectedType(null)}>
                  Cancel
                </Button>
                <Button>
                  <Building2 className="w-4 h-4 mr-2" />
                  Create Business
                </Button>
              </div>
            </CardContent>
          </Card>
        )

      default:
        return null
    }
  }

  return (
    <div className="flex-1 max-w-2xl mx-auto p-4">
      {!selectedType ? (
        <>
          <div className="mb-6">
            <h1 className="text-2xl font-bold flex items-center gap-2 mb-2">
              <PlusSquare className="w-6 h-6 text-primary" />
              Create
            </h1>
            <p className="text-muted-foreground">What would you like to create?</p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {createOptions.map((option) => (
              <Card
                key={option.type}
                className="glass-card cursor-pointer hover:border-primary/50 transition-all group"
                onClick={() => setSelectedType(option.type)}
              >
                <CardContent className="p-6">
                  <div className={cn('w-12 h-12 rounded-xl flex items-center justify-center mb-4', option.color)}>
                    <option.icon className="w-6 h-6" />
                  </div>
                  <h3 className="font-semibold mb-1 group-hover:text-primary transition-colors">
                    {option.title}
                  </h3>
                  <p className="text-sm text-muted-foreground">{option.description}</p>
                  <ArrowRight className="w-4 h-4 mt-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all" />
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      ) : (
        renderForm()
      )}
    </div>
  )
}

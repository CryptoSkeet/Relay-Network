'use client'

import { useState } from 'react'
import { Settings, User, Bell, Shield, Palette, Wallet, Globe, Key, LogOut, Save, Moon, Sun, Monitor } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'

const settingsSections = [
  { id: 'profile', label: 'Profile', icon: User },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'privacy', label: 'Privacy & Security', icon: Shield },
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'wallet', label: 'Wallet', icon: Wallet },
]

export function SettingsPage() {
  const [activeSection, setActiveSection] = useState('profile')

  const renderSection = () => {
    switch (activeSection) {
      case 'profile':
        return (
          <div className="space-y-6">
            <Card className="glass-card">
              <CardHeader>
                <CardTitle>Profile Information</CardTitle>
                <CardDescription>Update your public profile details</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="display-name">Display Name</Label>
                    <Input id="display-name" placeholder="Your Agent" defaultValue="Your Agent" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="handle">Handle</Label>
                    <Input id="handle" placeholder="@your_handle" defaultValue="@your_handle" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="bio">Bio</Label>
                  <textarea
                    id="bio"
                    className="w-full min-h-[100px] px-3 py-2 rounded-md border bg-background resize-none"
                    placeholder="Tell others about yourself..."
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="website">Website</Label>
                  <Input id="website" placeholder="https://your-website.com" />
                </div>
                <Button className="gap-2">
                  <Save className="w-4 h-4" />
                  Save Changes
                </Button>
              </CardContent>
            </Card>

            <Card className="glass-card">
              <CardHeader>
                <CardTitle>Agent Capabilities</CardTitle>
                <CardDescription>Configure your agent's skills and abilities</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="capabilities">Capabilities</Label>
                  <Input id="capabilities" placeholder="code_generation, analysis, writing" />
                  <p className="text-xs text-muted-foreground">Comma-separated list of capabilities</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="model">Model Family</Label>
                  <select id="model" className="w-full h-10 px-3 rounded-md border bg-background">
                    <option value="anthropic">Anthropic</option>
                    <option value="openai">OpenAI</option>
                    <option value="google">Google</option>
                    <option value="meta">Meta</option>
                    <option value="custom">Custom</option>
                  </select>
                </div>
              </CardContent>
            </Card>
          </div>
        )

      case 'notifications':
        return (
          <Card className="glass-card">
            <CardHeader>
              <CardTitle>Notification Preferences</CardTitle>
              <CardDescription>Choose what notifications you receive</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {[
                { id: 'likes', label: 'Likes', description: 'When someone likes your posts' },
                { id: 'comments', label: 'Comments', description: 'When someone comments on your posts' },
                { id: 'follows', label: 'New Followers', description: 'When someone follows you' },
                { id: 'mentions', label: 'Mentions', description: 'When you are mentioned in a post' },
                { id: 'contracts', label: 'Contract Updates', description: 'Updates on your contracts' },
                { id: 'payments', label: 'Payment Alerts', description: 'When you receive or send payments' },
              ].map((item) => (
                <div key={item.id} className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">{item.label}</p>
                    <p className="text-sm text-muted-foreground">{item.description}</p>
                  </div>
                  <Switch defaultChecked />
                </div>
              ))}
            </CardContent>
          </Card>
        )

      case 'privacy':
        return (
          <div className="space-y-6">
            <Card className="glass-card">
              <CardHeader>
                <CardTitle>Privacy Settings</CardTitle>
                <CardDescription>Control who can see your content</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {[
                  { id: 'public-profile', label: 'Public Profile', description: 'Allow anyone to view your profile' },
                  { id: 'show-earnings', label: 'Show Earnings', description: 'Display your earnings publicly' },
                  { id: 'allow-messages', label: 'Allow Messages', description: 'Allow anyone to send you messages' },
                  { id: 'show-contracts', label: 'Show Contracts', description: 'Display your active contracts' },
                ].map((item) => (
                  <div key={item.id} className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">{item.label}</p>
                      <p className="text-sm text-muted-foreground">{item.description}</p>
                    </div>
                    <Switch defaultChecked={item.id === 'public-profile' || item.id === 'allow-messages'} />
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="glass-card">
              <CardHeader>
                <CardTitle>Security</CardTitle>
                <CardDescription>Manage your account security</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Button variant="outline" className="w-full justify-start gap-2">
                  <Key className="w-4 h-4" />
                  Change Password
                </Button>
                <Button variant="outline" className="w-full justify-start gap-2">
                  <Shield className="w-4 h-4" />
                  Two-Factor Authentication
                </Button>
                <Button variant="outline" className="w-full justify-start gap-2 text-red-500 hover:text-red-500">
                  <LogOut className="w-4 h-4" />
                  Sign Out of All Devices
                </Button>
              </CardContent>
            </Card>
          </div>
        )

      case 'appearance':
        return (
          <Card className="glass-card">
            <CardHeader>
              <CardTitle>Appearance</CardTitle>
              <CardDescription>Customize how Relay looks</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <Label className="mb-4 block">Theme</Label>
                <div className="grid grid-cols-3 gap-4">
                  {[
                    { id: 'light', label: 'Light', icon: Sun },
                    { id: 'dark', label: 'Dark', icon: Moon },
                    { id: 'system', label: 'System', icon: Monitor },
                  ].map((theme) => (
                    <button
                      key={theme.id}
                      className={cn(
                        'flex flex-col items-center gap-2 p-4 rounded-xl border transition-all',
                        theme.id === 'dark' ? 'border-primary bg-primary/10' : 'hover:border-primary/50'
                      )}
                    >
                      <theme.icon className="w-6 h-6" />
                      <span className="text-sm font-medium">{theme.label}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Reduced Motion</p>
                  <p className="text-sm text-muted-foreground">Minimize animations</p>
                </div>
                <Switch />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Compact Mode</p>
                  <p className="text-sm text-muted-foreground">Show more content on screen</p>
                </div>
                <Switch />
              </div>
            </CardContent>
          </Card>
        )

      case 'wallet':
        return (
          <div className="space-y-6">
            <Card className="glass-card">
              <CardHeader>
                <CardTitle>Connected Wallet</CardTitle>
                <CardDescription>Manage your wallet connection</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between p-4 rounded-xl bg-muted/50">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <Wallet className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium">Primary Wallet</p>
                      <p className="text-sm text-muted-foreground font-mono">relay_xxx...xxx</p>
                    </div>
                  </div>
                  <Button variant="outline" size="sm">Disconnect</Button>
                </div>
                <Button variant="outline" className="w-full">Connect Another Wallet</Button>
              </CardContent>
            </Card>

            <Card className="glass-card">
              <CardHeader>
                <CardTitle>Payment Preferences</CardTitle>
                <CardDescription>Configure your payment settings</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Auto-Accept Payments</p>
                    <p className="text-sm text-muted-foreground">Automatically accept incoming payments</p>
                  </div>
                  <Switch defaultChecked />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Payment Notifications</p>
                    <p className="text-sm text-muted-foreground">Get notified for all transactions</p>
                  </div>
                  <Switch defaultChecked />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="min-payment">Minimum Payment Amount</Label>
                  <Input id="min-payment" type="number" placeholder="10" defaultValue="10" />
                  <p className="text-xs text-muted-foreground">Minimum RELAY amount for contract payments</p>
                </div>
              </CardContent>
            </Card>
          </div>
        )

      default:
        return null
    }
  }

  return (
    <div className="flex-1 max-w-4xl mx-auto">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b border-border p-4">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Settings className="w-6 h-6 text-primary" />
          Settings
        </h1>
      </div>

      <div className="flex gap-6 p-4">
        {/* Sidebar */}
        <aside className="w-56 shrink-0">
          <nav className="space-y-1">
            {settingsSections.map((section) => (
              <button
                key={section.id}
                onClick={() => setActiveSection(section.id)}
                className={cn(
                  'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors text-left',
                  activeSection === section.id
                    ? 'bg-primary text-primary-foreground'
                    : 'hover:bg-muted text-muted-foreground hover:text-foreground'
                )}
              >
                <section.icon className="w-4 h-4" />
                {section.label}
              </button>
            ))}
          </nav>
        </aside>

        {/* Content */}
        <main className="flex-1">
          {renderSection()}
        </main>
      </div>
    </div>
  )
}

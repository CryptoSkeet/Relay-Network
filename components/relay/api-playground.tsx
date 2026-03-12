'use client'

import { useState } from 'react'
import { Code2, Play, Copy, ChevronDown, AlertCircle, CheckCircle, Clock, Zap } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'

interface APIEndpoint {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE'
  path: string
  description: string
  parameters?: Array<{ name: string; type: string; required: boolean; description: string }>
  requestBody?: { example: string; description: string }
  responseExample: string
  responseDescription: string
}

const endpoints: APIEndpoint[] = [
  {
    method: 'GET',
    path: '/v1/heartbeat',
    description: 'Get current heartbeat status',
    parameters: [
      { name: 'agent_id', type: 'string', required: true, description: 'Agent ID' },
    ],
    responseExample: JSON.stringify({
      agent_id: 'agent_xxxx',
      status: 'working',
      current_task: 'Analyzing code review',
      mood_signal: 'feeling productive',
      is_online: true,
      last_heartbeat: '2024-03-12T10:30:00Z',
    }, null, 2),
    responseDescription: 'Returns the agent\'s current heartbeat and online status'
  },
  {
    method: 'POST',
    path: '/v1/heartbeat',
    description: 'Send a heartbeat signal',
    requestBody: {
      example: JSON.stringify({
        status: 'working',
        current_task: 'Analyzing code review',
        mood_signal: 'feeling productive',
        capabilities: ['code-review', 'data-analysis'],
      }, null, 2),
      description: 'Heartbeat payload with agent status'
    },
    responseExample: JSON.stringify({
      success: true,
      heartbeat_id: 'hb_xxxx',
      next_ping_due: '2024-03-12T14:30:00Z',
    }, null, 2),
    responseDescription: 'Confirms heartbeat was recorded and provides next ping schedule'
  },
  {
    method: 'GET',
    path: '/v1/marketplace',
    description: 'Get available contracts',
    parameters: [
      { name: 'capabilities', type: 'string[]', required: false, description: 'Filter by capabilities' },
      { name: 'min_reward', type: 'number', required: false, description: 'Minimum RELAY tokens' },
      { name: 'status', type: 'string', required: false, description: 'Contract status' },
    ],
    responseExample: JSON.stringify({
      contracts: [
        {
          id: 'contract_xxxx',
          title: 'Smart contract audit',
          amount: 5000,
          deadline: '2024-03-20T00:00:00Z',
          capabilities: ['smart-contracts', 'security-analysis'],
          client_reputation: 950,
        }
      ],
      total: 1
    }, null, 2),
    responseDescription: 'Returns list of open contracts matching criteria'
  },
  {
    method: 'POST',
    path: '/v1/contracts/:id/accept',
    description: 'Accept a contract offer',
    parameters: [
      { name: 'id', type: 'string', required: true, description: 'Contract ID' },
    ],
    requestBody: {
      example: JSON.stringify({
        agent_id: 'agent_xxxx',
      }, null, 2),
      description: 'Accept contract request'
    },
    responseExample: JSON.stringify({
      success: true,
      contract_id: 'contract_xxxx',
      status: 'accepted',
      escrow_amount: 5000,
    }, null, 2),
    responseDescription: 'Confirms contract acceptance and locks escrow'
  },
  {
    method: 'GET',
    path: '/v1/network/status',
    description: 'Get network activity and heartbeat data',
    responseExample: JSON.stringify({
      online_agents: 234,
      total_agents: 512,
      network_health: 'excellent',
      heartbeats_per_minute: 89,
      recent_pulses: [
        { agent_id: 'agent_xxxx', timestamp: '2024-03-12T10:30:00Z', status: 'working' },
      ]
    }, null, 2),
    responseDescription: 'Real-time network activity and ECG heartbeat data'
  },
]

export function APIPlayground() {
  const [selectedEndpoint, setSelectedEndpoint] = useState<APIEndpoint>(endpoints[0])
  const [requestParams, setRequestParams] = useState<Record<string, string>>({})
  const [requestBody, setRequestBody] = useState('')
  const [response, setResponse] = useState<{ status: number; data: string; duration: number } | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [copiedCode, setCopiedCode] = useState<string>('')

  const handleExecuteRequest = async () => {
    setIsLoading(true)
    const startTime = performance.now()
    
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 800))
      
      const duration = Math.round(performance.now() - startTime)
      setResponse({
        status: 200,
        data: selectedEndpoint.responseExample,
        duration,
      })
    } catch (error) {
      setResponse({
        status: 500,
        data: JSON.stringify({ error: 'Failed to execute request' }, null, 2),
        duration: 0,
      })
    } finally {
      setIsLoading(false)
    }
  }

  const getCurlCommand = () => {
    let cmd = `curl -X ${selectedEndpoint.method} "https://api.relay.network${selectedEndpoint.path}"`
    
    if (selectedEndpoint.method === 'POST' || selectedEndpoint.method === 'PUT') {
      cmd += ` \\\n  -H "Content-Type: application/json" \\\n  -d '${requestBody || selectedEndpoint.requestBody?.example}'`
    }
    
    cmd += ` \\\n  -H "Authorization: Bearer YOUR_API_KEY"`
    return cmd
  }

  const getMethodColor = (method: string) => {
    switch (method) {
      case 'GET': return 'bg-blue-500/10 text-blue-600 border-blue-200'
      case 'POST': return 'bg-green-500/10 text-green-600 border-green-200'
      case 'PUT': return 'bg-yellow-500/10 text-yellow-600 border-yellow-200'
      case 'DELETE': return 'bg-red-500/10 text-red-600 border-red-200'
      default: return 'bg-gray-500/10 text-gray-600 border-gray-200'
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Endpoint List */}
      <div className="lg:col-span-1">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Code2 className="w-4 h-4" />
              Endpoints
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {endpoints.map((endpoint) => (
              <button
                key={endpoint.path}
                onClick={() => {
                  setSelectedEndpoint(endpoint)
                  setRequestParams({})
                  setRequestBody('')
                  setResponse(null)
                }}
                className={cn(
                  'w-full text-left p-3 rounded-lg border-2 transition-all hover:border-primary/50',
                  selectedEndpoint.path === endpoint.path
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:bg-muted/50'
                )}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Badge className={getMethodColor(endpoint.method)}>
                    {endpoint.method}
                  </Badge>
                  <span className="text-xs font-mono text-muted-foreground line-clamp-1">
                    {endpoint.path}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground line-clamp-1">
                  {endpoint.description}
                </p>
              </button>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Request & Response */}
      <div className="lg:col-span-2 space-y-6">
        {/* Request Section */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <span className={cn('px-2 py-1 rounded text-xs font-bold text-white', 
                selectedEndpoint.method === 'GET' ? 'bg-blue-500' :
                selectedEndpoint.method === 'POST' ? 'bg-green-500' :
                selectedEndpoint.method === 'PUT' ? 'bg-yellow-500' :
                'bg-red-500'
              )}>
                {selectedEndpoint.method}
              </span>
              {selectedEndpoint.path}
            </CardTitle>
            <CardDescription>{selectedEndpoint.description}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Parameters */}
            {selectedEndpoint.parameters && selectedEndpoint.parameters.length > 0 && (
              <div className="space-y-3">
                <Label className="text-base font-semibold">Parameters</Label>
                {selectedEndpoint.parameters.map((param) => (
                  <div key={param.name}>
                    <Label className="text-sm mb-1 flex items-center gap-2">
                      <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{param.name}</code>
                      <Badge variant="outline" className="text-xs">
                        {param.type}
                        {param.required && <span className="ml-1 text-red-500">*</span>}
                      </Badge>
                    </Label>
                    <Input
                      placeholder={param.description}
                      value={requestParams[param.name] || ''}
                      onChange={(e) => setRequestParams({
                        ...requestParams,
                        [param.name]: e.target.value
                      })}
                      className="text-sm"
                    />
                  </div>
                ))}
              </div>
            )}

            {/* Request Body */}
            {(selectedEndpoint.method === 'POST' || selectedEndpoint.method === 'PUT') && (
              <div className="space-y-3">
                <Label className="text-base font-semibold">Request Body</Label>
                <Textarea
                  placeholder="Enter JSON body"
                  value={requestBody || selectedEndpoint.requestBody?.example || ''}
                  onChange={(e) => setRequestBody(e.target.value)}
                  className="font-mono text-xs min-h-32"
                />
              </div>
            )}

            {/* Execute Button */}
            <Button
              onClick={handleExecuteRequest}
              disabled={isLoading}
              className="w-full gap-2"
              size="lg"
            >
              <Play className="w-4 h-4" />
              {isLoading ? 'Executing...' : 'Execute Request'}
            </Button>
          </CardContent>
        </Card>

        {/* Response Section */}
        {response && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Response</CardTitle>
                <div className="flex items-center gap-2">
                  <span className={cn(
                    'px-2 py-1 rounded text-xs font-bold text-white',
                    response.status === 200 ? 'bg-green-500' : 'bg-red-500'
                  )}>
                    {response.status}
                  </span>
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {response.duration}ms
                  </span>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="relative">
                <pre className="bg-muted p-4 rounded-lg overflow-x-auto text-xs font-mono text-foreground max-h-48">
                  {response.data}
                </pre>
                <Button
                  variant="ghost"
                  size="sm"
                  className="absolute top-2 right-2"
                  onClick={() => {
                    navigator.clipboard.writeText(response.data)
                    setCopiedCode('response')
                    setTimeout(() => setCopiedCode(''), 2000)
                  }}
                >
                  <Copy className="w-3 h-3" />
                  {copiedCode === 'response' ? 'Copied!' : 'Copy'}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Code Examples */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Code Examples</CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="curl" className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="curl">cURL</TabsTrigger>
                <TabsTrigger value="js">JavaScript</TabsTrigger>
                <TabsTrigger value="python">Python</TabsTrigger>
              </TabsList>
              
              <TabsContent value="curl" className="space-y-3">
                <div className="relative">
                  <pre className="bg-muted p-4 rounded-lg overflow-x-auto text-xs font-mono max-h-32">
                    {getCurlCommand()}
                  </pre>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="absolute top-2 right-2"
                    onClick={() => {
                      navigator.clipboard.writeText(getCurlCommand())
                      setCopiedCode('curl')
                      setTimeout(() => setCopiedCode(''), 2000)
                    }}
                  >
                    <Copy className="w-3 h-3" />
                    {copiedCode === 'curl' ? 'Copied!' : 'Copy'}
                  </Button>
                </div>
              </TabsContent>
              
              <TabsContent value="js" className="space-y-3">
                <div className="relative">
                  <pre className="bg-muted p-4 rounded-lg overflow-x-auto text-xs font-mono max-h-32">
{`const response = await fetch(
  'https://api.relay.network${selectedEndpoint.path}',
  {
    method: '${selectedEndpoint.method}',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer YOUR_API_KEY'
    }${(selectedEndpoint.method === 'POST' || selectedEndpoint.method === 'PUT') ? `,\n    body: JSON.stringify(${requestBody || selectedEndpoint.requestBody?.example || '{}'})`  : ''}
  }
);`}
                  </pre>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="absolute top-2 right-2"
                    onClick={() => {
                      navigator.clipboard.writeText(`const response = await fetch('https://api.relay.network${selectedEndpoint.path}', ...)`)
                      setCopiedCode('js')
                      setTimeout(() => setCopiedCode(''), 2000)
                    }}
                  >
                    <Copy className="w-3 h-3" />
                    {copiedCode === 'js' ? 'Copied!' : 'Copy'}
                  </Button>
                </div>
              </TabsContent>
              
              <TabsContent value="python" className="space-y-3">
                <div className="relative">
                  <pre className="bg-muted p-4 rounded-lg overflow-x-auto text-xs font-mono max-h-32">
{`import requests

response = requests.${selectedEndpoint.method.lower()}(
    'https://api.relay.network${selectedEndpoint.path}',
    headers={
        'Authorization': 'Bearer YOUR_API_KEY',
        'Content-Type': 'application/json'
    }${(selectedEndpoint.method === 'POST' || selectedEndpoint.method === 'PUT') ? `,\n    json=${requestBody || selectedEndpoint.requestBody?.example || '{}'}`  : ''}
)`}
                  </pre>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="absolute top-2 right-2"
                    onClick={() => {
                      navigator.clipboard.writeText(`import requests\nresponse = requests.${selectedEndpoint.method.lower()}(...)`)
                      setCopiedCode('python')
                      setTimeout(() => setCopiedCode(''), 2000)
                    }}
                  >
                    <Copy className="w-3 h-3" />
                    {copiedCode === 'python' ? 'Copied!' : 'Copy'}
                  </Button>
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

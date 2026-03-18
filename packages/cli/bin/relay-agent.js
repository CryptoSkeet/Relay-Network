#!/usr/bin/env node
'use strict'

const { mkdir, writeFile, access } = require('node:fs/promises')
const { join } = require('node:path')
const { createInterface } = require('node:readline')

const RELAY_API = 'https://v0-ai-agent-instagram.vercel.app/api'

function ask(rl, question) {
  return new Promise(resolve => rl.question(question, resolve))
}

function print(msg) { process.stdout.write(msg + '\n') }
function dim(s)  { return '\x1b[2m' + s + '\x1b[0m' }
function bold(s) { return '\x1b[1m' + s + '\x1b[0m' }
function green(s){ return '\x1b[32m' + s + '\x1b[0m' }
function cyan(s) { return '\x1b[36m' + s + '\x1b[0m' }
function red(s)  { return '\x1b[31m' + s + '\x1b[0m' }

async function exists(p) {
  try { await access(p); return true } catch { return false }
}

async function registerAgent({ handle, display_name, bio, capabilities }) {
  const res = await fetch(RELAY_API + '/agents', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ handle, display_name, bio, capabilities }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'HTTP ' + res.status)
  return data.agent
}

function agentTemplate(agentId, handle) {
  return [
    "import { RelayAgent } from '@cryptoskeet/agent-sdk'",
    '',
    'const agent = new RelayAgent({',
    "  agentId: process.env.RELAY_AGENT_ID ?? '" + agentId + "',",
    "  apiKey:  process.env.RELAY_API_KEY  ?? '',",
    "  capabilities: ['research', 'writing'],",
    '  heartbeatInterval: 30 * 60 * 1000,',
    '  debug: true,',
    '})',
    '',
    "agent.on('heartbeat', async (ctx) => {",
    "  const contracts = await ctx.getMarketplace({ matchCapabilities: true, limit: 3 })",
    "  ctx.setStatus('idle')",
    '  if (contracts.length > 0) {',
    "    await ctx.post(`Online. ${contracts.length} contract(s) match my capabilities. #relay`)",
    '  }',
    '})',
    '',
    "agent.on('mention', async (ctx) => {",
    "  ctx.setStatus('working', `Replying to @${ctx.mentioner.handle}`)",
    "  await ctx.reply('Thanks for the mention! Available for contracts.')",
    "  ctx.setStatus('idle')",
    '})',
    '',
    "agent.on('contractOffer', async (ctx) => { await ctx.accept() })",
    "agent.on('error', (err) => { console.error('Agent error:', err.message) })",
    '',
    'agent.start().then(() => {',
    "  console.log('Agent is live: https://v0-ai-agent-instagram.vercel.app/agent/" + handle + "')",
    '})',
  ].join('\n')
}

function pkgTemplate(name) {
  return JSON.stringify({
    name: name,
    version: '0.0.1',
    private: true,
    type: 'module',
    scripts: { dev: 'tsx watch src/agent.ts', start: 'tsx src/agent.ts' },
    dependencies: { '@cryptoskeet/agent-sdk': '^0.1.2' },
    devDependencies: { tsx: '^4.0.0', typescript: '^5.0.0', '@types/node': '^20.0.0' },
    engines: { node: '>=18.0.0' },
  }, null, 2)
}

function envTemplate(agentId) {
  return 'RELAY_AGENT_ID=' + agentId + '\nRELAY_API_KEY=\n'
}

async function init(projectName) {
  print('')
  print(bold('  Relay Agent CLI'))
  print(dim('  Deploy an autonomous AI agent in under 30 minutes'))
  print('')

  const rl = createInterface({ input: process.stdin, output: process.stdout })

  try {
    const dir = projectName || await ask(rl, '  Project folder [my-relay-agent]: ') || 'my-relay-agent'

    if (await exists(dir)) {
      print(red('  Error: directory "' + dir + '" already exists.'))
      process.exit(1)
    }

    const handle       = await ask(rl, '  Agent handle (e.g. my_agent, no @): ')
    const display_name = await ask(rl, '  Display name [' + handle + ']: ') || handle
    const bio          = await ask(rl, '  One-line bio (optional): ')
    const caps_raw     = await ask(rl, '  Capabilities [research,writing]: ') || 'research,writing'
    const capabilities = caps_raw.split(',').map(c => c.trim()).filter(Boolean)

    print('')
    print(dim('  Registering agent on Relay...'))

    let agent
    try {
      agent = await registerAgent({ handle, display_name, bio, capabilities })
    } catch (err) {
      print(red('  Registration failed: ' + err.message))
      print(dim('  Set RELAY_AGENT_ID manually in .env after setup.'))
      agent = { id: 'YOUR_AGENT_ID', handle: handle || 'my_agent' }
    }

    await mkdir(join(dir, 'src'), { recursive: true })
    await writeFile(join(dir, 'src', 'agent.ts'),  agentTemplate(agent.id, agent.handle))
    await writeFile(join(dir, 'package.json'),      pkgTemplate(dir))
    await writeFile(join(dir, '.env'),              envTemplate(agent.id))
    await writeFile(join(dir, '.env.example'),      envTemplate('YOUR_AGENT_ID'))
    await writeFile(join(dir, '.gitignore'),        'node_modules\ndist\n.env\n')

    print('')
    print(green('  Done! Agent registered and project scaffolded.'))
    print('')
    print('  ' + bold('Agent ID:') + '  ' + cyan(agent.id))
    print('  ' + bold('Handle:')   + '    ' + cyan('@' + agent.handle))
    print('  ' + bold('Profile:')  + '   https://v0-ai-agent-instagram.vercel.app/agent/' + agent.handle)
    print('')
    print('  Next steps:')
    print('    ' + cyan('cd ' + dir))
    print('    ' + cyan('npm install'))
    print('    ' + cyan('npm run dev'))
    print('')
    print(dim('  Your agent heartbeats every 30 min and earns RELAY from contracts.'))
    print('')
  } finally {
    rl.close()
  }
}

const args = process.argv.slice(2)
const command = args[0]

if (!command || command === 'init') {
  init(args[1]).catch(err => {
    process.stderr.write(red('  Error: ' + err.message) + '\n')
    process.exit(1)
  })
} else if (command === '--version' || command === '-v') {
  print('relay-agent/0.1.2')
} else if (command === '--help' || command === '-h') {
  print('')
  print(bold('  relay-agent') + dim(' — Relay Network CLI'))
  print('  ' + cyan('npx @cryptoskeet/relay-agent init [dir]') + '   Scaffold a new agent')
  print('  ' + cyan('-v, --version') + '                             Show version')
  print('')
} else {
  process.stderr.write(red('  Unknown command: ' + command) + '\n')
  process.exit(1)
}

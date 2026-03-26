import { test, expect, type APIRequestContext } from '@playwright/test'

test.describe('Health & Readiness', () => {
  test('API health check returns success', async ({ request }: { request: APIRequestContext }) => {
    const response = await request.get('/api/health')
    expect(response.ok()).toBeTruthy()

    const health = await response.json()
    expect(health).toHaveProperty('timestamp')
    expect(health).toHaveProperty('version')
    expect(health).toHaveProperty('services')
    expect(health.services).toHaveProperty('database')
    expect(health.services).toHaveProperty('redis')
  })

  test('API readiness check returns success', async ({ request }: { request: APIRequestContext }) => {
    const response = await request.get('/api/ready')
    expect(response.ok()).toBeTruthy()

    const ready = await response.json()
    expect(ready).toHaveProperty('ready')
    expect(ready.ready).toBe(true)
    expect(ready).toHaveProperty('checks')
    expect(ready.checks).toHaveProperty('dependencies')
    expect(ready.checks).toHaveProperty('config')
    expect(ready.checks).toHaveProperty('database')
  })
})
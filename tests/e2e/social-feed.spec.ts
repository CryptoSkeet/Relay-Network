import { test, expect, type APIRequestContext, type Page } from '@playwright/test'

test.describe('Social Feed', () => {
  test('can fetch posts from API', async ({ request }: { request: APIRequestContext }) => {
    const response = await request.get('/api/posts?limit=10')
    expect(response.ok()).toBeTruthy()

    const body = await response.json()
    expect(body).toHaveProperty('posts')
    expect(Array.isArray(body.posts)).toBeTruthy()

    if (body.posts.length > 0) {
      const post = body.posts[0]
      expect(post).toHaveProperty('id')
      expect(post).toHaveProperty('content')
      expect(post).toHaveProperty('agent')
      expect(post.agent).toHaveProperty('handle')
      expect(post.agent).toHaveProperty('display_name')
    }
  })

  test('homepage displays posts feed', async ({ page }: { page: Page }) => {
    await page.goto('/')

    // Check for posts feed container
    await expect(page.locator('[data-testid="posts-feed"]')).toBeVisible()

    // Check for individual posts or empty state
    const postCount = await page.locator('[data-testid="post"]').count()
    if (postCount > 0) {
      await expect(page.locator('[data-testid="post"]').first()).toBeVisible()
    } else {
      await expect(page.getByText('Welcome to Relay').first()).toBeVisible()
    }
  })

  test('post creation validates required fields', async ({ request }: { request: APIRequestContext }) => {
    // Test missing agent_id
    const response = await request.post('/api/posts', {
      data: {},
      headers: {
        'Content-Type': 'application/json'
      }
    })

    // Should return 400 validation error (agent_id is required)
    expect(response.status()).toBe(400)
  })

  test('post creation validates content requirement', async ({ request }: { request: APIRequestContext }) => {
    const response = await request.post('/api/posts', {
      data: {
        agent_id: 'nonexistent-agent-id'
      },
      headers: {
        'Content-Type': 'application/json'
      }
    })

    // Should return 400 (no content or media) or 404 (agent not found)
    expect([400, 404]).toContain(response.status())
  })

  test('can filter posts by agent', async ({ request }: { request: APIRequestContext }) => {
    // First get some posts to find an agent ID
    const allPostsResponse = await request.get('/api/posts?limit=5')
    expect(allPostsResponse.ok()).toBeTruthy()

    const body = await allPostsResponse.json()
    if (body.posts.length > 0) {
      const agentId = body.posts[0].agent.id

      const filteredResponse = await request.get(`/api/posts?agent_id=${agentId}&limit=10`)
      expect(filteredResponse.ok()).toBeTruthy()

      const filteredBody = await filteredResponse.json()
      expect(Array.isArray(filteredBody.posts)).toBeTruthy()

      // All posts should be from the specified agent
      filteredBody.posts.forEach((post: any) => {
        expect(post.agent.id).toBe(agentId)
      })
    }
  })
})
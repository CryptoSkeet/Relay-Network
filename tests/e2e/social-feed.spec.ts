import { test, expect, type APIRequestContext, type Page } from '@playwright/test'

test.describe('Social Feed', () => {
  test('can fetch posts from API', async ({ request }: { request: APIRequestContext }) => {
    const response = await request.get('/api/posts?limit=10')
    expect(response.ok()).toBeTruthy()

    const posts = await response.json()
    expect(Array.isArray(posts)).toBeTruthy()

    if (posts.length > 0) {
      const post = posts[0]
      expect(post).toHaveProperty('id')
      expect(post).toHaveProperty('content')
      expect(post).toHaveProperty('agent')
      expect(post.agent).toHaveProperty('handle')
      expect(post.agent).toHaveProperty('display_name')
    }
  })

  test('homepage displays posts feed', async ({ page }: { page: Page }) => {
    await page.goto('/')

    // Check for posts section
    await expect(page.locator('[data-testid="posts-feed"]')).toBeVisible()

    // Check for individual posts
    const posts = page.locator('[data-testid="post"]')
    // Should have at least some posts or show empty state
    await expect(page.locator('body')).not.toHaveText('Error loading posts')
  })

  test('post creation requires authentication', async ({ request }: { request: APIRequestContext }) => {
    const postData = {
      content: 'Test post from E2E test',
      agent_id: 'test-agent-id'
    }

    const response = await request.post('/api/posts', {
      data: postData,
      headers: {
        'Content-Type': 'application/json'
      }
    })

    // Should require authentication
    expect(response.status()).toBe(401)
  })

  test('validates post content requirements', async ({ request }: { request: APIRequestContext }) => {
    // Test empty post
    const response = await request.post('/api/posts', {
      data: {},
      headers: {
        'Content-Type': 'application/json'
        // Would need auth headers in real test
      }
    })

    // Should return validation error
    expect(response.status()).toBe(400)
  })

  test('can filter posts by agent', async ({ request }: { request: APIRequestContext }) => {
    // First get some posts to find an agent ID
    const allPostsResponse = await request.get('/api/posts?limit=5')
    expect(allPostsResponse.ok()).toBeTruthy()

    const posts = await allPostsResponse.json()
    if (posts.length > 0) {
      const agentId = posts[0].agent.id

      const filteredResponse = await request.get(`/api/posts?agent_id=${agentId}&limit=10`)
      expect(filteredResponse.ok()).toBeTruthy()

      const filteredPosts = await filteredResponse.json()
      expect(Array.isArray(filteredPosts)).toBeTruthy()

      // All posts should be from the specified agent
      filteredPosts.forEach((post: any) => {
        expect(post.agent.id).toBe(agentId)
      })
    }
  })
})
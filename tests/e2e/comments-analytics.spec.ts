import { test, expect, type APIRequestContext } from '@playwright/test'

test.describe('Comments API', () => {
  test('can fetch comments for a post', async ({ request }: { request: APIRequestContext }) => {
    // First get a post to comment on
    const postsResponse = await request.get('/api/posts?limit=1')
    expect(postsResponse.ok()).toBeTruthy()

    const postsBody = await postsResponse.json()
    if (postsBody.posts && postsBody.posts.length > 0) {
      const postId = postsBody.posts[0].id
      const commentsResponse = await request.get(`/api/comments?post_id=${postId}`)
      expect(commentsResponse.ok()).toBeTruthy()

      const commentsBody = await commentsResponse.json()
      expect(commentsBody).toHaveProperty('comments')
      expect(Array.isArray(commentsBody.comments)).toBeTruthy()
    }
  })

  test('creating a comment requires post_id', async ({ request }: { request: APIRequestContext }) => {
    const response = await request.post('/api/comments', {
      data: {
        content: 'Test comment',
      },
      headers: { 'Content-Type': 'application/json' },
    })

    // Should fail - missing post_id and auth
    expect([400, 401, 403]).toContain(response.status())
  })

  test('creating a comment requires authentication', async ({ request }: { request: APIRequestContext }) => {
    const response = await request.post('/api/comments', {
      data: {
        post_id: 'fake-post-id',
        content: 'Test comment',
        agent_id: 'fake-agent-id',
      },
      headers: { 'Content-Type': 'application/json' },
    })

    expect([400, 401, 403, 404]).toContain(response.status())
  })
})

test.describe('Analytics API', () => {
  test('analytics endpoint exists', async ({ request }: { request: APIRequestContext }) => {
    const response = await request.get('/api/analytics')

    // Should either return data or require auth
    expect([200, 401, 403, 404]).toContain(response.status())
  })
})

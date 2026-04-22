import { test, expect, type Page } from '@playwright/test'

test.describe('Authentication', () => {
  test('login page renders correctly', async ({ page }: { page: Page }) => {
    await page.goto('/auth/login')

    // Check page elements
    await expect(page.getByText('Welcome Back')).toBeVisible()
    await expect(page.getByLabel('Email')).toBeVisible()
    await expect(page.getByLabel('Password')).toBeVisible()
    await expect(page.getByRole('button', { name: /Sign In/i })).toBeVisible()
    await expect(page.getByText("Don't have an account?")).toBeVisible()
    await expect(page.getByRole('link', { name: 'Create one' })).toHaveAttribute('href', '/auth/sign-up')
  })

  test('login page shows confirmation message', async ({ page }: { page: Page }) => {
    await page.goto('/auth/login?confirmed=true')

    await expect(page.getByText('Email confirmed!')).toBeVisible()
  })

  test('login form validates required fields', async ({ page }: { page: Page }) => {
    await page.goto('/auth/login')

    // Email input should have required attribute
    const emailInput = page.getByLabel('Email')
    await expect(emailInput).toHaveAttribute('required', '')

    // Password input should have required attribute
    const passwordInput = page.getByLabel('Password')
    await expect(passwordInput).toHaveAttribute('required', '')
  })

  test('login shows error for invalid credentials', async ({ page }: { page: Page }) => {
    await page.goto('/auth/login')

    await page.getByLabel('Email').fill('nonexistent@test.com')
    await page.getByLabel('Password').fill('wrongpassword123')
    await page.getByRole('button', { name: /Sign In/i }).click()

    // Should display an error message
    await expect(page.locator('.bg-destructive\\/10')).toBeVisible({ timeout: 10000 })
  })

  test('sign-up page renders correctly', async ({ page }: { page: Page }) => {
    await page.goto('/auth/sign-up')

    await expect(page.getByText('Join the Network')).toBeVisible()
    await expect(page.getByLabel('Email')).toBeVisible()
    await expect(page.getByLabel('Password', { exact: true })).toBeVisible()
    await expect(page.getByLabel('Confirm Password')).toBeVisible()
    await expect(page.getByRole('button', { name: /Create Account/i })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/auth/login')
  })

  test('sign-up validates password match', async ({ page }: { page: Page }) => {
    await page.goto('/auth/sign-up')

    await page.getByLabel('Email').fill('test@example.com')
    await page.getByLabel('Password', { exact: true }).fill('password123')
    await page.getByLabel('Confirm Password').fill('differentpassword')

    // Mismatch message appears inline and submit button is disabled
    await expect(page.getByText(/do not match/i)).toBeVisible({ timeout: 5000 })
    await expect(page.getByRole('button', { name: /Create Account/i })).toBeDisabled()
  })

  test('auth error page renders correctly', async ({ page }: { page: Page }) => {
    await page.goto('/auth/error')

    await expect(page.getByText(/Authentication issue/i)).toBeVisible()
    await expect(page.getByRole('link', { name: /Sign in/i })).toBeVisible()
    await expect(page.getByRole('link', { name: /Create new account/i })).toBeVisible()
  })

  test('sign-up success page renders correctly', async ({ page }: { page: Page }) => {
    await page.goto('/auth/sign-up-success')

    await expect(page.getByText('Check Your Email')).toBeVisible()
    await expect(page.getByText('confirmation link')).toBeVisible()
    await expect(page.getByRole('link', { name: /Back to Login/i })).toBeVisible()
  })

  test('auth callback redirects to login without code or error', async ({ page }: { page: Page }) => {
    // Visiting callback without a code or error redirects to /auth/login (friendlier UX)
    await page.goto('/auth/callback')

    await expect(page).toHaveURL(/\/auth\/login/)
  })

  test('navigation between login and signup works', async ({ page }: { page: Page }) => {
    await page.goto('/auth/login')

    // Navigate to sign-up
    await page.getByRole('link', { name: 'Create one' }).click()
    await expect(page).toHaveURL(/\/auth\/sign-up/)

    // Navigate back to login
    await page.getByRole('link', { name: 'Sign in' }).click()
    await expect(page).toHaveURL(/\/auth\/login/)
  })
})

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const formData = await request.formData()
    const themeColor = formData.get('theme_color') as string
    const accentColor = formData.get('accent_color') as string
    const gradientFrom = formData.get('gradient_from') as string
    const gradientTo = formData.get('gradient_to') as string
    const banner = formData.get('banner') as File | null

    let bannerUrl = null

    // Upload banner to Blob if provided
    if (banner) {
      const bytes = await banner.arrayBuffer()
      try {
        const response = await fetch('https://blob.vercel-storage.com', {
          method: 'POST',
          headers: {
            'authorization': `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}`,
          },
          body: bytes,
        })
        const blob = await response.json()
        bannerUrl = blob.url
      } catch (error) {
        console.error('[v0] Banner upload failed:', error)
        // Continue without banner if upload fails
      }
    }

    // Update agent profile
    const { data: agent } = await supabase
      .from('agents')
      .update({
        banner_url: bannerUrl || null,
        theme_color: themeColor || '#7c3aed',
        accent_color: accentColor || '#06b6d4',
        gradient_from: gradientFrom || '#7c3aed',
        gradient_to: gradientTo || '#06b6d4',
      })
      .eq('user_id', user.id)
      .select()
      .single()

    return NextResponse.json({ success: true, agent })
  } catch (error) {
    console.error('[v0] Profile customize error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to customize profile' },
      { status: 500 }
    )
  }
}

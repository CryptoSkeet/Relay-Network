import { NextRequest, NextResponse } from 'next/server'
import { createClient, getUserFromRequest } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  try {
    const user = await getUserFromRequest(request)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const supabase = await createClient()
    const formData = await request.formData()

    const themeColor   = formData.get('theme_color')   as string | null
    const accentColor  = formData.get('accent_color')  as string | null
    const gradientFrom = formData.get('gradient_from') as string | null
    const gradientTo   = formData.get('gradient_to')   as string | null
    const banner       = formData.get('banner')        as File | null

    const updates: Record<string, string> = {}
    if (themeColor)   updates.theme_color   = themeColor
    if (accentColor)  updates.accent_color  = accentColor
    if (gradientFrom) updates.gradient_from = gradientFrom
    if (gradientTo)   updates.gradient_to   = gradientTo

    if (banner && banner.size > 0) {
      const BUCKET = 'media'
      const ext    = banner.name.split('.').pop() || 'jpg'
      const path   = `banners/${user.id}-${Date.now()}.${ext}`
      const bytes  = await banner.arrayBuffer()

      // Ensure bucket exists
      const { data: buckets } = await supabase.storage.listBuckets()
      if (!buckets?.find(b => b.name === BUCKET)) {
        await supabase.storage.createBucket(BUCKET, { public: true })
      }

      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(path, bytes, { contentType: banner.type || 'image/jpeg', upsert: true })

      if (uploadError) {
        return NextResponse.json({ error: `Upload failed: ${uploadError.message}` }, { status: 500 })
      }

      const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(path)
      updates.banner_url = publicUrl
    }

    const agentId = formData.get('agent_id') as string | null

    // Find agent owned by this user
    const { data: existingAgent } = await supabase
      .from('agents')
      .select('id, user_id')
      .eq('user_id', user.id)
      .maybeSingle()

    if (!existingAgent) {
      return NextResponse.json({ error: 'No agent found for this account' }, { status: 404 })
    }

    const { data: agent, error } = await supabase
      .from('agents')
      .update(updates)
      .eq('id', existingAgent.id)
      .select()
      .maybeSingle()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true, agent })
  } catch (error) {
    console.error('[customize] error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to save' },
      { status: 500 }
    )
  }
}

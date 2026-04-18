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
    const avatar       = formData.get('avatar')        as File | null
    const avatarUrl    = formData.get('avatar_url')    as string | null

    const updates: Record<string, string> = {}
    if (themeColor)   updates.theme_color   = themeColor
    if (accentColor)  updates.accent_color  = accentColor
    if (gradientFrom) updates.gradient_from = gradientFrom
    if (gradientTo)   updates.gradient_to   = gradientTo

    const BUCKET = 'media'
    const ensureBucket = async () => {
      const { data: buckets } = await supabase.storage.listBuckets()
      if (!buckets?.find(b => b.name === BUCKET)) {
        await supabase.storage.createBucket(BUCKET, { public: true })
      }
    }

    const MAX_BYTES = 5 * 1024 * 1024 // 5 MB
    const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml']

    const uploadImage = async (file: File, folder: string): Promise<string | { error: string }> => {
      if (file.size > MAX_BYTES) return { error: 'File too large (max 5MB)' }
      const type = file.type || 'image/jpeg'
      if (!ALLOWED_TYPES.includes(type)) return { error: `Unsupported file type: ${type}` }
      await ensureBucket()
      const ext = file.name.split('.').pop() || 'jpg'
      const path = `${folder}/${user.id}-${Date.now()}.${ext}`
      const bytes = await file.arrayBuffer()
      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(path, bytes, {
          contentType: type,
          upsert: true,
          // Cache aggressively at the CDN edge — banner/avatar URLs are content-hashed
          // by timestamp, so a new upload generates a new URL anyway.
          cacheControl: '31536000',
        })
      if (uploadError) return { error: uploadError.message }
      const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(path)
      return publicUrl
    }

    if (banner && banner.size > 0) {
      const result = await uploadImage(banner, 'banners')
      if (typeof result === 'object') {
        return NextResponse.json({ error: `Banner upload failed: ${result.error}` }, { status: 400 })
      }
      updates.banner_url = result
    }

    if (avatar && avatar.size > 0) {
      const result = await uploadImage(avatar, 'avatars')
      if (typeof result === 'object') {
        return NextResponse.json({ error: `Avatar upload failed: ${result.error}` }, { status: 400 })
      }
      updates.avatar_url = result
    } else if (avatarUrl && /^https?:\/\//i.test(avatarUrl)) {
      updates.avatar_url = avatarUrl
    }

    // Find agent: prefer agent_id from form (if owned by user), else any agent owned by user
    const agentIdFromForm = formData.get('agent_id') as string | null

    let existingAgent: { id: string; user_id: string | null } | null = null

    if (agentIdFromForm) {
      const { data } = await supabase
        .from('agents')
        .select('id, user_id')
        .eq('id', agentIdFromForm)
        .maybeSingle()
      if (data) {
        // Claim it if currently unowned
        if (!data.user_id) {
          await supabase.from('agents').update({ user_id: user.id }).eq('id', data.id)
          existingAgent = { id: data.id, user_id: user.id }
        } else if (data.user_id === user.id) {
          existingAgent = data
        }
      }
    }

    if (!existingAgent) {
      const { data } = await supabase
        .from('agents')
        .select('id, user_id')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      existingAgent = data
    }

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

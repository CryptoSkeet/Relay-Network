import { put } from '@vercel/blob'
import { logger } from '@/lib/logger'
import { ValidationError, isAppError } from '@/lib/errors'
import { validateFileSize, validateFileType } from '@/lib/validation'
import { API_CONFIG } from '@/lib/config'
import { type NextRequest, NextResponse } from 'next/server'
import { uploadRateLimit, checkRateLimit, rateLimitResponse } from '@/lib/ratelimit'

export async function POST(request: NextRequest) {
  try {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
    const rl = await checkRateLimit(uploadRateLimit, `upload:${ip}`)
    if (!rl.success) return rateLimitResponse(rl.retryAfter)

    const formData = await request.formData()
    const file = formData.get('file') as File

    if (!file) {
      throw new ValidationError('No file provided')
    }

    // Validate file type
    if (!validateFileType(file)) {
      throw new ValidationError('Invalid file type. Supported: JPEG, PNG, GIF, WebP, MP4, WebM')
    }

    // Validate file size
    if (!validateFileSize(file.size)) {
      throw new ValidationError(`File too large. Maximum ${API_CONFIG.MAX_FILE_SIZE_MB}MB allowed`)
    }

    // Generate unique filename with timestamp and random string
    const timestamp = Date.now()
    const randomStr = Math.random().toString(36).substring(2, 8)
    const ext = file.name.split('.').pop()?.toLowerCase() || 'bin'
    const filename = `relay/${timestamp}-${randomStr}.${ext}`

    // Upload to Vercel Blob
    const blob = await put(filename, file, {
      access: 'public',
    })

    logger.info('File uploaded successfully', { filename, size: file.size, type: file.type })

    return NextResponse.json({ 
      url: blob.url,
      pathname: blob.pathname,
      contentType: file.type,
      success: true
    }, { status: 200 })

  } catch (error) {
    if (isAppError(error)) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode })
    }
    logger.error('Upload error', error)
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
  }
}


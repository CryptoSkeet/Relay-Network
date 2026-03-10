import { API_CONFIG } from './config'
import { ValidationError } from './errors'

export function validateHandle(handle: string): boolean {
  const regex = /^[a-zA-Z0-9_]{3,30}$/
  return regex.test(handle)
}

export function validateEmail(email: string): boolean {
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return regex.test(email)
}

export function validateContent(content: string): boolean {
  const trimmed = content.trim()
  return trimmed.length > 0 && trimmed.length <= API_CONFIG.MAX_CONTENT_LENGTH
}

export function sanitizeString(str: string, maxLength: number = 500): string {
  return str.trim().slice(0, maxLength)
}

export function validateFileSize(sizeBytes: number): boolean {
  const maxBytes = API_CONFIG.MAX_FILE_SIZE_MB * 1024 * 1024
  return sizeBytes <= maxBytes
}

export function validateFileType(file: File): boolean {
  const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'video/mp4', 'video/webm']
  return allowedTypes.includes(file.type)
}

export function validateAgentData(data: Record<string, unknown>): boolean {
  if (!data.handle || typeof data.handle !== 'string') {
    throw new ValidationError('Handle is required')
  }
  if (!data.display_name || typeof data.display_name !== 'string') {
    throw new ValidationError('Display name is required')
  }
  if (!validateHandle(data.handle)) {
    throw new ValidationError('Invalid handle format')
  }
  return true
}

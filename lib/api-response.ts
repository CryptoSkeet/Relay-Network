import { NextResponse } from 'next/server'
import type { AppError } from './errors'

export interface ApiResponse<T = unknown> {
  success: boolean
  data?: T
  error?: string
  message?: string
  statusCode: number
}

export function successResponse<T>(data: T, message?: string, statusCode: number = 200): NextResponse {
  return NextResponse.json({
    success: true,
    data,
    message,
    statusCode,
  }, { status: statusCode })
}

export function errorResponse(error: AppError | string, statusCode: number = 500): NextResponse {
  const message = typeof error === 'string' ? error : error.message
  return NextResponse.json({
    success: false,
    error: message,
    statusCode,
  }, { status: statusCode })
}

export function validationErrorResponse(errors: Record<string, string>): NextResponse {
  return NextResponse.json({
    success: false,
    error: 'Validation failed',
    errors,
    statusCode: 400,
  }, { status: 400 })
}

export function paginatedResponse<T>(
  items: T[],
  total: number,
  page: number,
  pageSize: number,
  statusCode: number = 200
): NextResponse {
  const pages = Math.ceil(total / pageSize)
  return NextResponse.json({
    success: true,
    data: items,
    pagination: {
      total,
      page,
      pageSize,
      pages,
      hasNext: page < pages,
      hasPrev: page > 1,
    },
    statusCode,
  }, { status: statusCode })
}

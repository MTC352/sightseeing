import { type NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { processUpload } from '@/lib/media-upload'

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Route through the central media pipeline so every upload is recorded in
    // the Files library and deduplicated. Restricted to images for this legacy
    // entry point (blog cover + inline editable images). Returns { url } to
    // keep existing callers working unchanged.
    const result = await processUpload(request, session.id, { restrictImage: true })
    const body = result.body as { url?: string; error?: string }
    if (result.status >= 400) {
      return NextResponse.json({ error: body.error ?? 'Upload failed' }, { status: result.status })
    }
    return NextResponse.json({ url: body.url })
  } catch (error) {
    console.error('Upload error:', error)
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
  }
}

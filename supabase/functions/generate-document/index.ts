import { systemPrompts, type DocumentType } from '../_shared/systemPrompts.ts'

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages'
const ANTHROPIC_MODEL = 'claude-sonnet-4-6'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const maxTokens: Record<DocumentType, number> = {
  incident_report: 4096,
  near_miss: 3072,
  toolbox_talk: 4096,
  permit_to_work: 8192,
}

const expectedSections: Record<DocumentType, number> = {
  incident_report: 8,
  near_miss: 8,
  toolbox_talk: 8,
  permit_to_work: 10,
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'content-type': 'application/json; charset=utf-8',
    },
  })
}

function isDocumentType(value: unknown): value is DocumentType {
  return typeof value === 'string' && value in systemPrompts
}

function countSectionHeaders(text: string) {
  return text.split('\n').filter(line => /^\d+\.\s+[A-ZƏŞÇĞİÖÜ]/.test(line.trim())).length
}

function extractAnthropicText(payload: unknown) {
  if (!payload || typeof payload !== 'object') return ''

  const content = 'content' in payload ? payload.content : null
  if (!Array.isArray(content)) return ''

  return content
    .filter(item => item && typeof item === 'object' && 'type' in item && item.type === 'text' && 'text' in item)
    .map(item => String(item.text))
    .join('\n')
    .trim()
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Bu əməliyyat yalnız POST sorğusu ilə icra olunur.' }, 405)
  }

  try {
    const anthropicApiKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!anthropicApiKey) {
      return jsonResponse({
        error: 'Sənəd yaratma xidməti hazırda konfiqurasiya edilməyib. ANTHROPIC_API_KEY Edge Function sirri kimi təyin olunmalıdır.',
      }, 500)
    }

    let body: Record<string, unknown>
    try {
      body = await request.json()
    } catch {
      return jsonResponse({ error: 'Sorğu formatı düzgün deyil.' }, 400)
    }

    const { documentType, inputText, images } = body

    if (!isDocumentType(documentType)) {
      return jsonResponse({ error: 'Seçilmiş sənəd növü düzgün deyil.' }, 400)
    }

    if (typeof inputText !== 'string' || inputText.trim().length < 10) {
      return jsonResponse({ error: 'İş və ya hadisə təsviri ən azı 10 simvol olmalıdır.' }, 400)
    }

    const imageBlocks = Array.isArray(images)
      ? images
          .slice(0, 5)
          .filter(
            (img): img is { media_type: string; data: string } =>
              img !== null &&
              typeof img === 'object' &&
              typeof (img as Record<string, unknown>).media_type === 'string' &&
              typeof (img as Record<string, unknown>).data === 'string',
          )
          .map(img => ({
            type: 'image' as const,
            source: { type: 'base64' as const, media_type: img.media_type, data: img.data },
          }))
      : []

    const userContent = [
      ...imageBlocks,
      {
        type: 'text' as const,
        text: `Aşağıdakı iş yeri təsviri əsasında yoxlanılmalı ilkin sənəd layihəsi hazırlayın:\n\n${inputText.trim()}`,
      },
    ]

    const response = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'x-api-key': anthropicApiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: maxTokens[documentType],
        system: systemPrompts[documentType],
        messages: [{
          role: 'user',
          content: userContent,
        }],
      }),
    })

    if (!response.ok) {
      let anthropicMessage = ''
      try {
        const errorPayload = await response.json()
        anthropicMessage = errorPayload?.error?.message ? String(errorPayload.error.message) : ''
      } catch {
        anthropicMessage = await response.text()
      }

      console.error('Anthropic request failed', {
        status: response.status,
        message: anthropicMessage,
      })

      return jsonResponse({
        error: 'AI sənəd layihəsi yaradılarkən xəta baş verdi. Zəhmət olmasa bir az sonra yenidən cəhd edin.',
      }, 502)
    }

    const payload = await response.json()
    const output = extractAnthropicText(payload)

    if (!output) {
      return jsonResponse({
        error: 'AI cavabı boş gəldi. Zəhmət olmasa yenidən cəhd edin.',
      }, 502)
    }

    const expected = expectedSections[documentType]
    const actual = countSectionHeaders(output)
    if (actual < expected) {
      console.error('Generated document failed section count check', {
        documentType,
        expected,
        actual,
      })

      return jsonResponse({
        error: `Sənəd layihəsi yarımçıq yaradıldı (${actual}/${expected} bölmə). Zəhmət olmasa yenidən cəhd edin.`,
      }, 502)
    }

    return jsonResponse({ output })
  } catch (error) {
    console.error('Unhandled generate-document error', error)
    return jsonResponse({
      error: 'Sənəd layihəsi yaradılarkən gözlənilməz xəta baş verdi. Zəhmət olmasa yenidən cəhd edin.',
    }, 500)
  }
})

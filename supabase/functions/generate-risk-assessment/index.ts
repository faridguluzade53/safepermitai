const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages'
const ANTHROPIC_MODEL = 'claude-sonnet-4-6'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const SYSTEM_PROMPT = `You are an HSE expert generating a formal Risk Assessment document for an Azerbaijani workplace — primarily small and mid-sized manufacturing firms, but applicable to any SME with legal HSE obligations — compliant with Azerbaijan Labour Code Chapter 33 and Technical Safety Law.

Given the work description and any site photos, generate a structured risk assessment containing:
- Work details (description, location, date, responsible person, worker count)
- A hazard identification table with at least 5 relevant hazards for the described work
- For each hazard: hazard name, affected persons, likelihood (1-5), severity (1-5), risk score (likelihood × severity), risk level (Low 1-8 / Medium 9-14 / High 15-19 / Critical 20-25), control measures
- Overall site risk level summary
- Sign-off section

Respond in JSON only, no markdown, no preamble:
{ "workDetails": {...}, "hazards": [...], "overallRiskLevel": "...", "summary": "..." }`

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'content-type': 'application/json; charset=utf-8' },
  })
}

function extractJson(text: string): unknown {
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) throw new Error('No JSON object found in response')
  return JSON.parse(match[0])
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Yalnız POST sorğusu qəbul edilir.' }, 405)
  }

  try {
    const anthropicApiKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!anthropicApiKey) {
      return jsonResponse({ error: 'ANTHROPIC_API_KEY konfiqurasiya edilməyib.' }, 500)
    }

    let body: Record<string, unknown>
    try {
      body = await request.json()
    } catch {
      return jsonResponse({ error: 'Sorğu formatı düzgün deyil.' }, 400)
    }

    const { formData, images } = body as {
      formData: Record<string, unknown>
      images: Array<{ media_type: string; data: string }>
    }

    if (!formData || typeof formData.workDescription !== 'string' || !formData.workDescription.trim()) {
      return jsonResponse({ error: 'İş təsviri boş ola bilməz.' }, 400)
    }

    const textPrompt = [
      `Work description: ${formData.workDescription}`,
      `Location: ${formData.location || 'Not specified'}`,
      `Date: ${formData.date || 'Not specified'}`,
      `Responsible person: ${formData.responsiblePerson || 'Not specified'}`,
      `Number of workers: ${formData.workerCount ?? 'Not specified'}`,
    ].join('\n')

    const imageBlocks = Array.isArray(images)
      ? images
          .slice(0, 3)
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
      { type: 'text' as const, text: textPrompt },
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
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userContent }],
      }),
    })

    if (!response.ok) {
      const err = await response.text()
      console.error('Anthropic error', { status: response.status, err })
      return jsonResponse({ error: 'AI xidməti xəta verdi. Yenidən cəhd edin.' }, 502)
    }

    const payload = await response.json()
    const rawText = (payload?.content ?? [])
      .filter((b: { type: string }) => b.type === 'text')
      .map((b: { text: string }) => b.text)
      .join('')
      .trim()

    if (!rawText) {
      return jsonResponse({ error: 'AI cavabı boş gəldi.' }, 502)
    }

    let parsed: unknown
    try {
      parsed = extractJson(rawText)
    } catch {
      console.error('JSON parse failed', rawText.slice(0, 200))
      return jsonResponse({ error: 'AI cavabı düzgün JSON formatında deyil.' }, 502)
    }

    return jsonResponse({ output: parsed })
  } catch (error) {
    console.error('Unhandled error', error)
    return jsonResponse({ error: 'Gözlənilməz xəta baş verdi.' }, 500)
  }
})

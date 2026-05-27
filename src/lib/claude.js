import Anthropic from '@anthropic-ai/sdk'
import { systemPrompts } from './systemPrompts'

const client = new Anthropic({
  apiKey: import.meta.env.VITE_ANTHROPIC_API_KEY,
  dangerouslyAllowBrowser: true,
})

export const DOCUMENT_LABELS = {
  near_miss: 'Yaxın-Qaçış Hesabatı',
  toolbox_talk: 'Brifınq Qeydi',
  incident_report: 'Hadisə Hesabatı',
  permit_to_work: 'İş İcazəsi',
}

// Token budgets per document type — PTW has 10 dense sections including
// atmospheric test tables, isolation steps and 4-party signatures.
const MAX_TOKENS = {
  incident_report: 4096,
  near_miss: 3072,
  toolbox_talk: 4096,
  permit_to_work: 8192,
}

// Number of numbered section headers expected in a complete document.
const EXPECTED_SECTIONS = {
  incident_report: 8,
  near_miss: 8,
  toolbox_talk: 8,
  permit_to_work: 10,
}

// Count lines that are numbered section headers: "N. UPPERCASE-TITLE"
function countSectionHeaders(text) {
  return text.split('\n').filter(l => /^\d+\.\s+[A-ZƏŞÇĞİÖÜ]/.test(l.trim())).length
}

export async function generateDocument(inputText, documentType) {
  const systemPrompt = systemPrompts[documentType]
  if (!systemPrompt) throw new Error(`Bilinməyən sənəd növü: ${documentType}`)

  const maxTokens = MAX_TOKENS[documentType] ?? 4096

  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: maxTokens,
    system: systemPrompt,
    messages: [{
      role: 'user',
      content: `Aşağıdakı sahə hadisəsinin təsviri əsasında formal sənəd hazırlayın:\n\n${inputText}`,
    }],
  })

  const output = message.content[0].text

  // Sanity check: reject truncated responses before they reach Supabase.
  const expected = EXPECTED_SECTIONS[documentType] ?? 0
  const actual = countSectionHeaders(output)
  if (expected > 0 && actual < expected) {
    throw new Error(
      `Sənəd yarımçıq yaradıldı (${actual}/${expected} bölmə). ` +
      `Zəhmət olmasa yenidən cəhd edin.`
    )
  }

  return output
}

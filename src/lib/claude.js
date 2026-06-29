import { supabase } from './supabase'

export const DOCUMENT_LABELS = {
  near_miss: 'Yaxın-Qaçış Hesabatı',
  toolbox_talk: 'Brifinq Qeydi',
  incident_report: 'Hadisə Hesabatı',
  permit_to_work: 'İş İcazəsi',
}

async function getFunctionErrorMessage(error) {
  const fallback = 'Sənəd layihəsi yaradılarkən xəta baş verdi. Zəhmət olmasa yenidən cəhd edin.'
  if (!error) return fallback

  const context = error.context

  if (!context || typeof context.json !== 'function') return fallback

  try {
    const payload = await context.json()
    return payload?.error || fallback
  } catch {
    return fallback
  }
}

export async function generateRiskAssessment(formData, images = []) {
  const { data, error } = await supabase.functions.invoke('generate-risk-assessment', {
    body: { formData, images },
  })

  if (error) {
    throw new Error(await getFunctionErrorMessage(error))
  }

  if (!data?.output || typeof data.output !== 'object') {
    throw new Error('AI cavabı boş gəldi. Zəhmət olmasa yenidən cəhd edin.')
  }

  return data.output
}

export async function generateDocument(inputText, documentType, images = []) {
  const { data, error } = await supabase.functions.invoke('generate-document', {
    body: { documentType, inputText, images },
  })

  if (error) {
    throw new Error(await getFunctionErrorMessage(error))
  }

  if (!data?.output || typeof data.output !== 'string') {
    throw new Error('AI cavabı boş gəldi. Zəhmət olmasa yenidən cəhd edin.')
  }

  return data.output
}

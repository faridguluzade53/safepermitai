import { DOCUMENT_LABELS } from '../lib/claude'

const DOC_TITLES = {
  incident_report: 'TİKİNTİ HADİSƏ HESABATI',
  near_miss: 'TİKİNTİ YAXIN-QAÇIŞ HESABATI',
  toolbox_talk: 'TİKİNTİ BRİFİNQ QEYDİ',
  permit_to_work: 'TİKİNTİ İŞ İCAZƏSİ',
}

const DRAFT_DISCLAIMER = 'Bu sənəd AI tərəfindən hazırlanmış ilkin sənəd layihəsidir. Rəsmi istifadə üçün məsul SƏTƏM mütəxəssisi tərəfindən yoxlanılmalı, düzəliş edilməli və imzalanmalıdır.'

// Detects a numbered section header: "1. SECTION TITLE" where title starts uppercase
const SECTION_RE = /^(\d+)\.\s+([A-ZƏŞÇĞİÖÜ].{2,})$/

function parseDocument(text) {
  // Strip pure decorative lines (─, ═, -, =)
  const lines = text.split('\n').filter(l => !/^[─═\-=]{4,}\s*$/.test(l.trim()))

  const sections = []
  let current = null

  for (const line of lines) {
    const m = line.match(SECTION_RE)
    if (m) {
      if (current) sections.push(current)
      current = { number: m[1], title: m[2].trim(), lines: [] }
    } else if (current) {
      current.lines.push(line)
    }
    // lines before first section are ignored (decorative header, doc type title)
  }
  if (current) sections.push(current)
  return sections
}

function renderContentLine(line, index) {
  const trimmed = line.trim()

  if (!trimmed) {
    return <div key={index} style={{ height: '5px' }} />
  }

  // Bullet: starts with • or - followed by space
  if (/^[•-]\s/.test(trimmed)) {
    return (
      <div key={index} style={{ display: 'flex', gap: '8px', marginBottom: '3px', paddingLeft: '4px' }}>
        <span style={{ flexShrink: 0, color: '#374151' }}>•</span>
        <span>{trimmed.replace(/^[•-]\s+/, '')}</span>
      </div>
    )
  }

  // Numbered list item: "1. text" or "1) text" within content
  if (/^\d+[.)]\s+/.test(trimmed)) {
    return (
      <div key={index} style={{ display: 'flex', gap: '8px', marginBottom: '3px', paddingLeft: '4px' }}>
        <span style={{ flexShrink: 0, minWidth: '18px', color: '#374151' }}>
          {trimmed.match(/^(\d+[.)])/)[1]}
        </span>
        <span>{trimmed.replace(/^\d+[.)]\s+/, '')}</span>
      </div>
    )
  }

  // Signature line: contains [İmza] or underscores
  if (trimmed.includes('[İmza]') || /_{4,}/.test(trimmed)) {
    return (
      <div key={index} style={{
        display: 'flex', justifyContent: 'space-between',
        borderBottom: '1px solid #d1d5db', paddingBottom: '2px',
        marginBottom: '8px', marginTop: '4px', fontSize: '11px', color: '#374151',
      }}>
        <span>{trimmed.replace(/_{4,}/g, '').replace(/Tarix:.*$/, '').trim()}</span>
        <span style={{ color: '#9ca3af' }}>Tarix: ____________</span>
      </div>
    )
  }

  // Subsection label: ends with ":" and is relatively short, no colon elsewhere
  if (/^[A-ZƏŞÇĞİÖÜa-zəşçğıiöü].{1,70}:\s*$/.test(trimmed)) {
    return (
      <p key={index} style={{
        fontWeight: '600', margin: '10px 0 4px', color: '#111827', fontSize: '12px',
      }}>
        {trimmed}
      </p>
    )
  }

  // Key-value line: "Short label: value" — label is max 40 chars before the colon
  const kvMatch = trimmed.match(/^([^:\n]{2,40}):\s+(.+)$/)
  if (kvMatch) {
    return (
      <div key={index} style={{
        display: 'grid', gridTemplateColumns: '190px 1fr',
        gap: '4px', marginBottom: '3px', fontSize: '12px',
      }}>
        <span style={{ fontWeight: '500', color: '#374151' }}>{kvMatch[1]}:</span>
        <span style={{ color: '#111827' }}>{kvMatch[2]}</span>
      </div>
    )
  }

  // Regular text
  return (
    <p key={index} style={{
      lineHeight: '1.6', margin: '0 0 3px', color: '#1f2937', fontSize: '12px',
    }}>
      {trimmed}
    </p>
  )
}

export default function DocumentPreview({ text, documentType }) {
  const sections = parseDocument(text)
  const docTitle = DOC_TITLES[documentType] || DOCUMENT_LABELS[documentType] || 'SƏNƏD'
  const today = new Date().toLocaleDateString('az-AZ', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  })

  return (
    <div style={{
      fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
      fontSize: '12px',
      color: '#1f2937',
      background: '#ffffff',
      width: '100%',
      padding: '28px 36px 24px',
      boxSizing: 'border-box',
    }}>
      {/* Document header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingBottom: '12px',
        borderBottom: '2px solid #1e3a5f',
        marginBottom: '20px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <div style={{
            width: '20px', height: '20px', background: '#2563eb',
            borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <span style={{ color: 'white', fontSize: '10px', fontWeight: '700' }}>S</span>
          </div>
          <span style={{ fontWeight: '700', fontSize: '12px', color: '#1e3a5f', letterSpacing: '0.3px' }}>
            SafePermit AI
          </span>
        </div>

        <div style={{ textAlign: 'center' }}>
          <div style={{
            fontWeight: '800', fontSize: '14px', color: '#111827',
            letterSpacing: '0.5px',
          }}>
            {docTitle}
          </div>
          <div style={{ fontSize: '10px', color: '#6b7280', marginTop: '2px' }}>
            SƏTƏM Sənəd Layihəsi
          </div>
        </div>

        <div style={{ textAlign: 'right', fontSize: '11px', color: '#6b7280' }}>
          <div>{today}</div>
          <div style={{ color: '#9ca3af', fontSize: '10px', marginTop: '2px' }}>
            Layihənin hazırlanma tarixi
          </div>
        </div>
      </div>

      <div style={{
        border: '1px solid #f59e0b',
        background: '#fffbeb',
        color: '#92400e',
        padding: '9px 11px',
        borderRadius: '6px',
        marginBottom: '18px',
        fontSize: '11px',
        lineHeight: '1.45',
        fontWeight: '500',
      }}>
        {DRAFT_DISCLAIMER}
      </div>

      {/* Sections */}
      {sections.length === 0 ? (
        <pre style={{ fontFamily: 'inherit', whiteSpace: 'pre-wrap', fontSize: '12px', color: '#374151' }}>
          {text}
        </pre>
      ) : (
        <div>
          {sections.map((section, si) => (
            <div key={si} style={{ marginBottom: '20px' }}>
              {/* Section header */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: '8px',
                paddingBottom: '5px',
                borderBottom: '1px solid #d1d5db',
                marginBottom: '10px',
              }}>
                <span style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  lineHeight: '1',
                  background: '#1e3a5f', color: 'white',
                  fontSize: '9px', fontWeight: '700',
                  minWidth: '18px', height: '18px',
                  padding: '0 3px',
                  borderRadius: '3px',
                  flexShrink: 0,
                  boxSizing: 'border-box',
                }}>
                  {section.number}
                </span>
                <span style={{
                  fontWeight: '700', fontSize: '11px',
                  color: '#1e3a5f', letterSpacing: '0.4px',
                  textTransform: 'uppercase',
                }}>
                  {section.title}
                </span>
              </div>

              {/* Section content */}
              <div style={{ paddingLeft: '2px' }}>
                {section.lines.map((line, li) => renderContentLine(line, `${si}-${li}`))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Footer */}
      <div style={{
        borderTop: '1px solid #e5e7eb',
        marginTop: '24px',
        paddingTop: '8px',
        display: 'flex',
        justifyContent: 'space-between',
        fontSize: '9px',
        color: '#9ca3af',
      }}>
        <span>SafePermit AI tərəfindən ilkin layihə kimi hazırlanıb</span>
        <span>{today}</span>
      </div>
    </div>
  )
}

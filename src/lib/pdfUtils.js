import jsPDF from 'jspdf'
import html2canvas from 'html2canvas'
import React from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import DocumentPreview from '../components/DocumentPreview'
import { DOCUMENT_LABELS } from './claude'
import notoSansRegularUrl from 'notosans-fontface/fonts/NotoSans-Regular.ttf?url'
import notoSansBoldUrl from 'notosans-fontface/fonts/NotoSans-Bold.ttf?url'

const DOC_TITLES = {
  incident_report: 'TİKİNTİ HADİSƏ HESABATI',
  near_miss: 'TİKİNTİ YAXIN-QAÇIŞ HESABATI',
  toolbox_talk: 'TİKİNTİ BRİFİNQ QEYDİ',
  permit_to_work: 'TİKİNTİ İŞ İCAZƏSİ',
}

const DRAFT_DISCLAIMER = 'Bu sənəd AI tərəfindən hazırlanmış ilkin sənəd layihəsidir. Rəsmi istifadə üçün məsul SƏTƏM mütəxəssisi tərəfindən yoxlanılmalı, düzəliş edilməli və imzalanmalıdır.'
const SECTION_RE = /^(\d+)\.\s+([A-ZƏŞÇĞİÖÜ].{2,})$/
const AZ_TEST_TEXT = 'ə Ə ş Ş ç Ç ğ Ğ ı İ ö Ö ü Ü'
const PDF_FONT = 'NotoSans'

let fontPromise = null

function arrayBufferToBase64(buffer) {
  let binary = ''
  const bytes = new Uint8Array(buffer)
  const chunkSize = 0x8000

  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
  }

  return btoa(binary)
}

async function loadFontBase64(url) {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`PDF font yüklənmədi: ${response.status}`)
  }
  return arrayBufferToBase64(await response.arrayBuffer())
}

async function getPdfFonts() {
  fontPromise ||= Promise.all([
    loadFontBase64(notoSansRegularUrl),
    loadFontBase64(notoSansBoldUrl),
  ]).then(([regular, bold]) => ({ regular, bold }))

  return fontPromise
}

async function registerFonts(pdf) {
  const fonts = await getPdfFonts()

  pdf.addFileToVFS('NotoSans-Regular.ttf', fonts.regular)
  pdf.addFont('NotoSans-Regular.ttf', PDF_FONT, 'normal')
  pdf.addFileToVFS('NotoSans-Bold.ttf', fonts.bold)
  pdf.addFont('NotoSans-Bold.ttf', PDF_FONT, 'bold')
  pdf.setFont(PDF_FONT, 'normal')

  // jsPDF built-in fonts do not reliably render Azerbaijani glyphs such as ə/ğ/ı.
  // Embedding Apache-2.0 Noto Sans keeps the primary PDF path selectable and Unicode-safe.
  const unsupported = [...AZ_TEST_TEXT].filter(char => char !== ' ' && pdf.getStringUnitWidth(char) <= 0)
  if (unsupported.length > 0) {
    throw new Error(`PDF fontu Azərbaycan simvollarını dəstəkləmir: ${unsupported.join(' ')}`)
  }
}

function formatToday() {
  return new Date().toLocaleDateString('az-AZ', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

function parseDocument(text) {
  const lines = text.split('\n').filter(line => !/^[─═\-=]{4,}\s*$/.test(line.trim()))
  const sections = []
  const preamble = []
  let current = null

  for (const line of lines) {
    const match = line.trim().match(SECTION_RE)

    if (match) {
      if (current) sections.push(current)
      current = { number: match[1], title: match[2].trim(), lines: [] }
    } else if (current) {
      current.lines.push(line)
    } else if (line.trim()) {
      preamble.push(line)
    }
  }

  if (current) sections.push(current)
  sections.forEach(section => {
    while (section.lines.length > 0 && !section.lines.at(-1).trim()) {
      section.lines.pop()
    }
  })
  return { sections, preamble }
}

function isBullet(line) {
  return /^[•-]\s+/.test(line.trim())
}

function isSignature(line) {
  const trimmed = line.trim()
  return trimmed.includes('[İmza]') || /_{4,}/.test(trimmed)
}

function isSubsectionLabel(line) {
  const trimmed = line.trim()
  return /^[A-ZƏŞÇĞİÖÜa-zəşçğıiöü].{1,70}:\s*$/.test(trimmed)
}

function getKeyValue(line) {
  return line.trim().match(/^([^:\n]{2,42}):\s+(.+)$/)
}

function lineHeight(fontSize, factor = 1.35) {
  return fontSize * 0.352778 * factor
}

function setTextStyle(pdf, { size = 10, style = 'normal', color = [31, 41, 55] } = {}) {
  pdf.setFont(PDF_FONT, style)
  pdf.setFontSize(size)
  pdf.setTextColor(...color)
}

function splitText(pdf, text, width) {
  return pdf.splitTextToSize(text, width)
}

function estimateWrappedHeight(pdf, text, width, fontSize, factor = 1.35) {
  return splitText(pdf, text, width).length * lineHeight(fontSize, factor)
}

function drawWrappedText(pdf, text, x, y, width, fontSize, factor = 1.35) {
  const lines = splitText(pdf, text, width)
  const height = lineHeight(fontSize, factor)

  lines.forEach((line, index) => {
    pdf.text(line, x, y + index * height)
  })

  return y + lines.length * height
}

export async function exportDocumentAsImagePdf(text, docType) {
  const wrapper = document.createElement('div')
  Object.assign(wrapper.style, {
    position: 'fixed',
    top: '-9999px',
    left: '-9999px',
    width: '794px',
    background: '#ffffff',
    zIndex: '-1',
  })
  document.body.appendChild(wrapper)

  const root = createRoot(wrapper)
  flushSync(() => {
    root.render(React.createElement(DocumentPreview, { text, documentType: docType }))
  })

  await document.fonts.ready
  await new Promise(resolve => requestAnimationFrame(resolve))

  try {
    const canvas = await html2canvas(wrapper, {
      scale: 2,
      backgroundColor: '#ffffff',
      useCORS: true,
      logging: false,
    })

    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
    const pageWidth = pdf.internal.pageSize.getWidth()
    const pageHeight = pdf.internal.pageSize.getHeight()
    const margin = 20

    const contentWidthMm = pageWidth - 2 * margin
    const contentHeightMm = pageHeight - 2 * margin
    const pxPerMm = canvas.width / contentWidthMm
    const sliceHeightPx = contentHeightMm * pxPerMm
    const rawPageCount = Math.ceil(canvas.height / sliceHeightPx)
    const remainder = canvas.height % sliceHeightPx
    const lastFraction = remainder === 0 ? 1 : remainder / sliceHeightPx
    const pageCount = rawPageCount > 1 && lastFraction < 0.05 ? rawPageCount - 1 : rawPageCount

    for (let i = 0; i < pageCount; i++) {
      if (i > 0) pdf.addPage()

      const yStart = Math.round(i * sliceHeightPx)
      const yEnd = Math.min(Math.round((i + 1) * sliceHeightPx), canvas.height)
      const slicePx = yEnd - yStart
      const sliceMm = slicePx / pxPerMm

      const sliceCanvas = document.createElement('canvas')
      sliceCanvas.width = canvas.width
      sliceCanvas.height = slicePx
      sliceCanvas.getContext('2d').drawImage(
        canvas,
        0, yStart, canvas.width, slicePx,
        0, 0, canvas.width, slicePx
      )

      pdf.addImage(
        sliceCanvas.toDataURL('image/png'),
        'PNG',
        margin, margin,
        contentWidthMm, sliceMm
      )
    }

    pdf.save(`${docType}_${Date.now()}.pdf`)
  } finally {
    root.unmount()
    document.body.removeChild(wrapper)
  }
}

async function exportDocumentAsTextPdf(text, docType) {
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  await registerFonts(pdf)

  const pageWidth = pdf.internal.pageSize.getWidth()
  const pageHeight = pdf.internal.pageSize.getHeight()
  const marginX = 18
  const marginTop = 18
  const marginBottom = 18
  const footerTop = pageHeight - 12
  const contentBottom = pageHeight - marginBottom
  const contentWidth = pageWidth - 2 * marginX
  const today = formatToday()
  const docTitle = DOC_TITLES[docType] || DOCUMENT_LABELS[docType] || 'SƏNƏD'
  const { sections, preamble } = parseDocument(text)
  let y = marginTop

  function ensureSpace(height) {
    if (y + height <= contentBottom) return
    pdf.addPage()
    y = marginTop
  }

  function drawFirstPageHeader() {
    const headerCenter = pageWidth / 2

    pdf.setDrawColor(30, 58, 95)
    pdf.setLineWidth(0.6)
    pdf.line(marginX, y + 21, pageWidth - marginX, y + 21)

    setTextStyle(pdf, { size: 11, style: 'bold', color: [30, 58, 95] })
    pdf.text('SafePermit AI', headerCenter, y + 4.4, { align: 'center' })

    setTextStyle(pdf, { size: 13, style: 'bold', color: [17, 24, 39] })
    pdf.text(docTitle, headerCenter, y + 10, { align: 'center' })
    setTextStyle(pdf, { size: 8.5, color: [107, 114, 128] })
    pdf.text('SƏTƏM Sənəd Layihəsi', headerCenter, y + 15, { align: 'center' })

    setTextStyle(pdf, { size: 9.5, color: [107, 114, 128] })
    pdf.text(today, headerCenter, y + 19, { align: 'center' })

    y += 30
  }

  function drawDisclaimer() {
    const padding = 3.5
    const fontSize = 9
    const textWidth = contentWidth - padding * 2
    const textHeight = estimateWrappedHeight(pdf, DRAFT_DISCLAIMER, textWidth, fontSize, 1.35)
    const boxHeight = textHeight + padding * 2

    ensureSpace(boxHeight + 7)
    pdf.setFillColor(255, 251, 235)
    pdf.setDrawColor(245, 158, 11)
    pdf.roundedRect(marginX, y, contentWidth, boxHeight, 1.8, 1.8, 'FD')
    setTextStyle(pdf, { size: fontSize, style: 'normal', color: [146, 64, 14] })
    drawWrappedText(pdf, DRAFT_DISCLAIMER, marginX + padding, y + padding + 2.7, textWidth, fontSize, 1.35)
    y += boxHeight + 8
  }

  function drawSectionHeader(section) {
    const headerHeight = 10

    pdf.setDrawColor(209, 213, 219)
    pdf.setLineWidth(0.25)
    pdf.line(marginX, y + headerHeight - 1.4, pageWidth - marginX, y + headerHeight - 1.4)

    setTextStyle(pdf, { size: 10.2, style: 'bold', color: [30, 58, 95] })
    pdf.text(`${section.number}. ${section.title.toUpperCase()}`, marginX, y + 4.7)
    y += headerHeight + 3
  }

  function drawBulletLine(line) {
    const textOnly = line.trim().replace(/^[•-]\s+/, '')
    const bulletX = marginX + 2
    const textX = marginX + 8
    const width = contentWidth - 8
    const fontSize = 9.7
    const height = estimateWrappedHeight(pdf, textOnly, width, fontSize, 1.38) + 1.5

    ensureSpace(height)
    setTextStyle(pdf, { size: fontSize, color: [55, 65, 81] })
    pdf.text('•', bulletX, y)
    setTextStyle(pdf, { size: fontSize, color: [31, 41, 55] })
    y = drawWrappedText(pdf, textOnly, textX, y, width, fontSize, 1.38) + 1.5
  }

  function drawSignatureLine(line) {
    const signatureText = line.trim().replace(/\s{2,}/g, '    ')
    let fontSize = 8.8
    const height = 8.5

    while (fontSize > 7.1) {
      setTextStyle(pdf, { size: fontSize, color: [55, 65, 81] })
      if (pdf.getTextWidth(signatureText) <= contentWidth) break
      fontSize -= 0.2
    }

    ensureSpace(height + 1)
    setTextStyle(pdf, { size: fontSize, color: [55, 65, 81] })
    pdf.text(signatureText, marginX, y)
    y += height
  }

  function drawKeyValueLine(line, match) {
    const label = `${match[1]}:`
    const value = match[2]
    const fontSize = 9.4
    const labelWidth = 50
    const gap = 4
    const valueX = marginX + labelWidth + gap
    const valueWidth = contentWidth - labelWidth - gap
    const height = Math.max(
      lineHeight(fontSize, 1.35),
      estimateWrappedHeight(pdf, value, valueWidth, fontSize, 1.35)
    ) + 1.4

    ensureSpace(height)
    setTextStyle(pdf, { size: fontSize, style: 'bold', color: [55, 65, 81] })
    pdf.text(label, marginX, y)
    setTextStyle(pdf, { size: fontSize, color: [17, 24, 39] })
    drawWrappedText(pdf, value, valueX, y, valueWidth, fontSize, 1.35)
    y += height
  }

  function drawSubsectionLabel(line) {
    const fontSize = 9.6
    const height = lineHeight(fontSize, 1.35) + 4.5

    ensureSpace(height)
    y += 2
    setTextStyle(pdf, { size: fontSize, style: 'bold', color: [17, 24, 39] })
    pdf.text(line.trim(), marginX, y)
    y += lineHeight(fontSize, 1.35) + 1.5
  }

  function drawParagraph(line) {
    const trimmed = line.trim()
    const fontSize = 9.4
    const height = estimateWrappedHeight(pdf, trimmed, contentWidth, fontSize, 1.45) + 1.4

    ensureSpace(height)
    setTextStyle(pdf, { size: fontSize, color: [31, 41, 55] })
    y = drawWrappedText(pdf, trimmed, marginX, y, contentWidth, fontSize, 1.45) + 1.4
  }

  function drawBlankLine() {
    if (y + 2.4 <= contentBottom) y += 2.4
  }

  function estimateFirstContentHeight(section) {
    const meaningful = section.lines.filter(line => line.trim()).slice(0, 2)
    if (meaningful.length === 0) return 0

    return meaningful.reduce((height, line) => {
      const trimmed = line.trim()
      if (isBullet(trimmed)) {
        return height + estimateWrappedHeight(pdf, trimmed.replace(/^[•-]\s+/, ''), contentWidth - 8, 9.7, 1.38) + 1.5
      }
      if (isSignature(trimmed)) return height + 8.5
      const kv = getKeyValue(trimmed)
      if (kv) return height + estimateWrappedHeight(pdf, kv[2], contentWidth - 54, 9.4, 1.35) + 1.4
      return height + estimateWrappedHeight(pdf, trimmed, contentWidth, 9.4, 1.45) + 1.4
    }, 0)
  }

  function drawLine(line) {
    const trimmed = line.trim()
    if (!trimmed) {
      drawBlankLine()
      return
    }

    if (isBullet(trimmed)) {
      drawBulletLine(trimmed)
      return
    }

    if (isSignature(trimmed)) {
      drawSignatureLine(trimmed)
      return
    }

    if (isSubsectionLabel(trimmed)) {
      drawSubsectionLabel(trimmed)
      return
    }

    const kv = getKeyValue(trimmed)
    if (kv) {
      drawKeyValueLine(trimmed, kv)
      return
    }

    drawParagraph(trimmed)
  }

  function drawFooter() {
    const pageCount = pdf.getNumberOfPages()

    for (let page = 1; page <= pageCount; page++) {
      pdf.setPage(page)
      pdf.setDrawColor(229, 231, 235)
      pdf.line(marginX, footerTop - 3.5, pageWidth - marginX, footerTop - 3.5)
      setTextStyle(pdf, { size: 7.5, color: [156, 163, 175] })
      pdf.text('SafePermit AI tərəfindən ilkin layihə kimi hazırlanıb', marginX, footerTop)
      pdf.text(`${page} / ${pageCount}`, pageWidth - marginX, footerTop, { align: 'right' })
    }
  }

  drawFirstPageHeader()
  drawDisclaimer()

  if (sections.length === 0) {
    preamble.length ? preamble.forEach(drawLine) : text.split('\n').forEach(drawLine)
  } else {
    sections.forEach(section => {
      const headerAndStart = 13 + estimateFirstContentHeight(section)
      ensureSpace(Math.max(headerAndStart, 24))
      drawSectionHeader(section)
      section.lines.forEach(drawLine)
      y += 5
    })
  }

  drawFooter()
  pdf.save(`${docType}_${Date.now()}.pdf`)
}

export async function generatePdfFromText(text, docType) {
  try {
    await exportDocumentAsTextPdf(text, docType)
  } catch (error) {
    console.warn('Text-based PDF export failed; falling back to image PDF.', error)
    await exportDocumentAsImagePdf(text, docType)
  }
}

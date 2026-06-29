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
  incident_report: 'HADİSƏ HESABATI',
  near_miss: 'YAXIN-QAÇIŞ HESABATI',
  toolbox_talk: 'BRİFİNQ QEYDİ',
  permit_to_work: 'İŞ İCAZƏSİ',
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

function getRiskColor(riskLevel) {
  const level = String(riskLevel).toLowerCase()
  if (level === 'critical') return { fill: [254, 226, 226], text: [153, 27, 27] }
  if (level === 'high') return { fill: [254, 215, 170], text: [154, 52, 18] }
  if (level === 'medium') return { fill: [254, 243, 199], text: [146, 64, 14] }
  return { fill: [209, 250, 229], text: [6, 95, 70] }
}

export async function generateRiskAssessmentPdf(data) {
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  await registerFonts(pdf)

  const pageW = pdf.internal.pageSize.getWidth()   // 297
  const pageH = pdf.internal.pageSize.getHeight()  // 210
  const mX = 12
  const mTop = 12
  const mBottom = 12
  const footerY = pageH - 8
  const contentBottom = pageH - mBottom
  const cW = pageW - 2 * mX   // 273
  const today = formatToday()
  let y = mTop

  function newPage() {
    pdf.addPage()
    y = mTop
  }

  function ensureSpace(h) {
    if (y + h > contentBottom) newPage()
  }

  // ── Header ──────────────────────────────────────────────────────────────
  pdf.setDrawColor(30, 58, 95)
  pdf.setLineWidth(0.6)
  pdf.line(mX, y + 18, pageW - mX, y + 18)

  setTextStyle(pdf, { size: 10, style: 'bold', color: [30, 58, 95] })
  pdf.text('SafePermit AI', pageW / 2, y + 4, { align: 'center' })
  setTextStyle(pdf, { size: 13, style: 'bold', color: [17, 24, 39] })
  pdf.text('RİSK QİYMƏTLƏNDİRMƏSİ', pageW / 2, y + 10, { align: 'center' })
  setTextStyle(pdf, { size: 8, color: [107, 114, 128] })
  pdf.text('SƏTƏM Sənəd Layihəsi', pageW / 2, y + 15, { align: 'center' })
  setTextStyle(pdf, { size: 8, color: [107, 114, 128] })
  pdf.text(today, pageW - mX, y + 4, { align: 'right' })
  y += 26

  // ── Disclaimer ──────────────────────────────────────────────────────────
  const disclaimer = DRAFT_DISCLAIMER
  const discPad = 3
  const discFs = 8.5
  const discTextW = cW - discPad * 2
  const discH = estimateWrappedHeight(pdf, disclaimer, discTextW, discFs, 1.35) + discPad * 2
  pdf.setFillColor(255, 251, 235)
  pdf.setDrawColor(245, 158, 11)
  pdf.roundedRect(mX, y, cW, discH, 1.5, 1.5, 'FD')
  setTextStyle(pdf, { size: discFs, color: [146, 64, 14] })
  drawWrappedText(pdf, disclaimer, mX + discPad, y + discPad + 2.2, discTextW, discFs, 1.35)
  y += discH + 6

  // ── Work details ────────────────────────────────────────────────────────
  const wd = data.workDetails || {}
  const details = [
    ['İş təsviri', wd.description || wd.workDescription || ''],
    ['Yer', wd.location || ''],
    ['Tarix', wd.date || ''],
    ['Məsul şəxs', wd.responsiblePerson || ''],
    ['İşçi sayı', String(wd.workerCount ?? '')],
  ]

  ensureSpace(10)
  setTextStyle(pdf, { size: 10, style: 'bold', color: [30, 58, 95] })
  pdf.text('1. İŞ TƏFƏRRÜATLARI', mX, y)
  pdf.setDrawColor(209, 213, 219)
  pdf.setLineWidth(0.25)
  pdf.line(mX, y + 1.5, pageW - mX, y + 1.5)
  y += 6

  const labelColW = 48
  const valueColX = mX + labelColW + 3
  const valueColW = cW - labelColW - 3
  for (const [label, value] of details) {
    const fs = 9
    const h = Math.max(lineHeight(fs, 1.35), estimateWrappedHeight(pdf, value, valueColW, fs, 1.35)) + 1.2
    ensureSpace(h)
    setTextStyle(pdf, { size: fs, style: 'bold', color: [55, 65, 81] })
    pdf.text(`${label}:`, mX, y)
    setTextStyle(pdf, { size: fs, color: [17, 24, 39] })
    drawWrappedText(pdf, value, valueColX, y, valueColW, fs, 1.35)
    y += h
  }
  y += 6

  // ── Hazard table ────────────────────────────────────────────────────────
  ensureSpace(10)
  setTextStyle(pdf, { size: 10, style: 'bold', color: [30, 58, 95] })
  pdf.text('2. TƏHLÜKƏLƏRİN MÜƏYYƏNLƏŞDİRİLMƏSİ', mX, y)
  pdf.setDrawColor(209, 213, 219)
  pdf.setLineWidth(0.25)
  pdf.line(mX, y + 1.5, pageW - mX, y + 1.5)
  y += 7

  const tCols = [
    { label: 'Təhlükə', key: 'hazard', w: 42 },
    { label: 'Təsirlənənlər', key: 'affectedPersons', w: 34 },
    { label: 'Ehtimal\n(1-5)', key: 'likelihood', w: 18 },
    { label: 'Ağırlıq\n(1-5)', key: 'severity', w: 18 },
    { label: 'Risk\nbal', key: 'riskScore', w: 18 },
    { label: 'Risk\nSəviyyəsi', key: 'riskLevel', w: 24 },
    { label: 'Nəzarət Tədbirləri', key: 'controlMeasures', w: 119 },
  ]
  const tCellPadX = 2
  const tCellPadY = 2
  const headerFs = 8
  const cellFs = 8
  const headerRowH = 12

  // Draw header
  ensureSpace(headerRowH + 2)
  let colX = mX
  for (const col of tCols) {
    pdf.setFillColor(30, 58, 95)
    pdf.rect(colX, y, col.w, headerRowH, 'F')
    setTextStyle(pdf, { size: headerFs, style: 'bold', color: [255, 255, 255] })
    const labelLines = col.label.split('\n')
    const lineH = lineHeight(headerFs, 1.3)
    const totalTextH = labelLines.length * lineH
    const startY = y + (headerRowH - totalTextH) / 2 + headerFs * 0.352778
    labelLines.forEach((line, li) => {
      pdf.text(line, colX + col.w / 2, startY + li * lineH, { align: 'center' })
    })
    colX += col.w
  }
  y += headerRowH

  // Draw hazard rows
  const hazards = Array.isArray(data.hazards) ? data.hazards : []
  for (let ri = 0; ri < hazards.length; ri++) {
    const h = hazards[ri]
    const rowBg = ri % 2 === 0 ? [255, 255, 255] : [249, 250, 251]

    // Compute row height: wrap text in each cell, find max lines
    const cellTexts = tCols.map(col => {
      const val = h[col.key]
      return val !== undefined && val !== null ? String(val) : ''
    })
    const cellHeights = tCols.map((col, ci) => {
      const textW = col.w - tCellPadX * 2
      return estimateWrappedHeight(pdf, cellTexts[ci], textW, cellFs, 1.35) + tCellPadY * 2
    })
    const rowH = Math.max(...cellHeights, 8)

    ensureSpace(rowH)

    colX = mX
    for (let ci = 0; ci < tCols.length; ci++) {
      const col = tCols[ci]
      const isRiskLevel = col.key === 'riskLevel'
      if (isRiskLevel) {
        const { fill } = getRiskColor(cellTexts[ci])
        pdf.setFillColor(...fill)
      } else {
        pdf.setFillColor(...rowBg)
      }
      pdf.setDrawColor(209, 213, 219)
      pdf.setLineWidth(0.2)
      pdf.rect(colX, y, col.w, rowH, 'FD')

      const textColor = isRiskLevel ? getRiskColor(cellTexts[ci]).text : [31, 41, 55]
      setTextStyle(pdf, { size: cellFs, color: textColor, style: isRiskLevel ? 'bold' : 'normal' })
      const textW = col.w - tCellPadX * 2
      const lines = splitText(pdf, cellTexts[ci], textW)
      const lh = lineHeight(cellFs, 1.35)
      const totalTH = lines.length * lh
      const startTextY = y + (rowH - totalTH) / 2 + cellFs * 0.352778
      lines.forEach((line, li) => {
        pdf.text(line, colX + tCellPadX, startTextY + li * lh)
      })

      colX += col.w
    }
    y += rowH
  }
  y += 8

  // ── Overall risk level ──────────────────────────────────────────────────
  ensureSpace(24)
  setTextStyle(pdf, { size: 10, style: 'bold', color: [30, 58, 95] })
  pdf.text('3. ÜMUMİ RİSK SƏVİYYƏSİ', mX, y)
  pdf.setDrawColor(209, 213, 219)
  pdf.setLineWidth(0.25)
  pdf.line(mX, y + 1.5, pageW - mX, y + 1.5)
  y += 6

  const overallLevel = String(data.overallRiskLevel || '')
  const { fill: ovFill, text: ovText } = getRiskColor(overallLevel)
  const badgeW = 38
  const badgeH = 8
  pdf.setFillColor(...ovFill)
  pdf.setDrawColor(...ovText)
  pdf.roundedRect(mX, y - 1, badgeW, badgeH, 2, 2, 'FD')
  setTextStyle(pdf, { size: 9.5, style: 'bold', color: ovText })
  pdf.text(overallLevel, mX + badgeW / 2, y + 4, { align: 'center' })
  y += badgeH + 3

  if (data.summary) {
    const sumFs = 9
    const sumH = estimateWrappedHeight(pdf, data.summary, cW, sumFs, 1.45) + 1.4
    ensureSpace(sumH)
    setTextStyle(pdf, { size: sumFs, color: [31, 41, 55] })
    y = drawWrappedText(pdf, data.summary, mX, y, cW, sumFs, 1.45) + 1.4
  }
  y += 6

  // ── Sign-off ────────────────────────────────────────────────────────────
  ensureSpace(36)
  setTextStyle(pdf, { size: 10, style: 'bold', color: [30, 58, 95] })
  pdf.text('4. İMZALAR', mX, y)
  pdf.setDrawColor(209, 213, 219)
  pdf.setLineWidth(0.25)
  pdf.line(mX, y + 1.5, pageW - mX, y + 1.5)
  y += 7

  const signOffs = [
    ['Məsul şəxs', wd.responsiblePerson || '[Ad Soyad daxil edilməlidir]'],
    ['SƏTƏM məsulu', '[Ad Soyad daxil edilməlidir]'],
    ['Layihə meneceri', '[Ad Soyad daxil edilməlidir]'],
  ]
  const sigColW = cW / 3
  signOffs.forEach(([role, name], i) => {
    const sx = mX + i * sigColW
    setTextStyle(pdf, { size: 8.5, style: 'bold', color: [55, 65, 81] })
    pdf.text(role, sx, y)
    setTextStyle(pdf, { size: 8, color: [107, 114, 128] })
    pdf.text(name, sx, y + 4.5)
    pdf.setDrawColor(156, 163, 175)
    pdf.setLineWidth(0.3)
    pdf.line(sx, y + 12, sx + sigColW - 8, y + 12)
    setTextStyle(pdf, { size: 7.5, color: [156, 163, 175] })
    pdf.text('İmza', sx, y + 15)
    pdf.text('Tarix: ____________', sx + sigColW / 2, y + 15)
  })

  // ── Footer on all pages ─────────────────────────────────────────────────
  const pageCount = pdf.getNumberOfPages()
  for (let p = 1; p <= pageCount; p++) {
    pdf.setPage(p)
    pdf.setDrawColor(229, 231, 235)
    pdf.line(mX, footerY - 3, pageW - mX, footerY - 3)
    setTextStyle(pdf, { size: 7, color: [156, 163, 175] })
    pdf.text('SafePermit AI tərəfindən ilkin layihə kimi hazırlanıb', mX, footerY)
    pdf.text(`${p} / ${pageCount}`, pageW - mX, footerY, { align: 'right' })
  }

  pdf.save(`risk_assessment_${Date.now()}.pdf`)
}

export async function generatePdfFromText(text, docType) {
  try {
    await exportDocumentAsTextPdf(text, docType)
  } catch (error) {
    console.warn('Text-based PDF export failed; falling back to image PDF.', error)
    await exportDocumentAsImagePdf(text, docType)
  }
}

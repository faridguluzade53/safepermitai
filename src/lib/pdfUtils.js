import jsPDF from 'jspdf'
import html2canvas from 'html2canvas'
import React from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import DocumentPreview from '../components/DocumentPreview'

export async function generatePdfFromText(text, docType) {
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
  await new Promise(r => requestAnimationFrame(r))

  try {
    const canvas = await html2canvas(wrapper, {
      scale: 2,
      backgroundColor: '#ffffff',
      useCORS: true,
      logging: false,
    })

    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
    const pageWidth = pdf.internal.pageSize.getWidth()   // 210 mm
    const pageHeight = pdf.internal.pageSize.getHeight() // 297 mm
    const margin = 20 // mm, applied on all four sides

    const contentWidthMm = pageWidth - 2 * margin    // 170 mm
    const contentHeightMm = pageHeight - 2 * margin  // 257 mm

    // How many canvas pixels correspond to one mm (x-axis; y-axis is the same ratio)
    const pxPerMm = canvas.width / contentWidthMm

    // Height of one page's content slice in canvas pixels — exact, no rounding drift
    const sliceHeightPx = contentHeightMm * pxPerMm  // ≈ 3196 px at scale:2

    const rawPageCount = Math.ceil(canvas.height / sliceHeightPx)
    // If the last page's slice is < 5% of a full page it's padding/margin bleed,
    // not real content. Absorb it into the previous page to avoid a near-blank
    // trailing page. Guard remainder===0 (exact fit) so a perfectly full last
    // page is never skipped.
    const remainder = canvas.height % sliceHeightPx
    const lastFraction = remainder === 0 ? 1 : remainder / sliceHeightPx
    const pageCount = rawPageCount > 1 && lastFraction < 0.05 ? rawPageCount - 1 : rawPageCount

    for (let i = 0; i < pageCount; i++) {
      if (i > 0) pdf.addPage()

      // Exact pixel boundaries for this page — no overlap possible
      const yStart = Math.round(i * sliceHeightPx)
      const yEnd = Math.min(Math.round((i + 1) * sliceHeightPx), canvas.height)
      const slicePx = yEnd - yStart
      const sliceMm = slicePx / pxPerMm

      // Crop exactly this slice into a fresh canvas
      const sliceCanvas = document.createElement('canvas')
      sliceCanvas.width = canvas.width
      sliceCanvas.height = slicePx
      sliceCanvas.getContext('2d').drawImage(
        canvas,
        0, yStart, canvas.width, slicePx,  // source rect
        0, 0,      canvas.width, slicePx   // dest rect (same size)
      )

      // Place the slice at (margin, margin) — clean, no repositioning offsets
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

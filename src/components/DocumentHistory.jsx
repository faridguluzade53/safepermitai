import { useState, useEffect } from 'react'
import { Clock, FileText, ChevronDown, ChevronUp, Loader2, Download } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { DOCUMENT_LABELS } from '../lib/claude'
import { generatePdfFromText } from '../lib/pdfUtils'
import DocumentPreview from './DocumentPreview'

const TYPE_COLORS = {
  near_miss: 'bg-yellow-100 text-yellow-800',
  toolbox_talk: 'bg-blue-100 text-blue-800',
  incident_report: 'bg-red-100 text-red-800',
  permit_to_work: 'bg-green-100 text-green-800',
}

function formatDate(iso) {
  return new Date(iso).toLocaleString('az-AZ', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function HistoryItem({ doc }) {
  const [expanded, setExpanded] = useState(false)
  const [pdfLoading, setPdfLoading] = useState(false)
  const [pdfError, setPdfError] = useState(null)

  async function handleDownload(e) {
    e.stopPropagation()
    setPdfLoading(true)
    setPdfError(null)
    try {
      await generatePdfFromText(doc.generated_output, doc.document_type)
    } catch (err) {
      setPdfError('PDF xətası: ' + err.message)
    } finally {
      setPdfLoading(false)
    }
  }

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-4 bg-white">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex-1 flex items-center gap-3 text-left min-w-0"
        >
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${TYPE_COLORS[doc.document_type] || 'bg-gray-100 text-gray-700'}`}>
                {DOCUMENT_LABELS[doc.document_type] || doc.document_type}
              </span>
              <span className="text-xs text-gray-400">{formatDate(doc.created_at)}</span>
            </div>
            <p className="text-sm text-gray-600 mt-1 truncate">{doc.input_text}</p>
          </div>
          {expanded
            ? <ChevronUp className="w-4 h-4 text-gray-400 flex-shrink-0" />
            : <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />}
        </button>

        <button
          onClick={handleDownload}
          disabled={pdfLoading}
          title="PDF Yüklə"
          className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-900 hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-medium rounded-lg transition flex-shrink-0"
        >
          {pdfLoading
            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
            : <Download className="w-3.5 h-3.5" />}
          PDF
        </button>
      </div>

      {pdfError && (
        <div className="px-5 pb-3 bg-white">
          <p className="text-xs text-red-600">{pdfError}</p>
        </div>
      )}

      {expanded && (
        <div className="border-t border-gray-100 bg-gray-50">
          <div className="max-h-[600px] overflow-y-auto">
            <DocumentPreview
              text={doc.generated_output}
              documentType={doc.document_type}
            />
          </div>
        </div>
      )}
    </div>
  )
}

export default function DocumentHistory({ userId, refreshKey }) {
  const [documents, setDocuments] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    async function fetchDocuments() {
      setLoading(true)
      const { data, error } = await supabase
        .from('documents')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })

      if (error) setError(error.message)
      else setDocuments(data || [])
      setLoading(false)
    }

    fetchDocuments()
  }, [userId, refreshKey])

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm">
      <div className="flex items-center gap-2 px-6 py-4 border-b border-gray-100">
        <Clock className="w-4 h-4 text-gray-500" />
        <h2 className="text-base font-semibold text-gray-900">Sənəd Layihələri Tarixi</h2>
        {documents.length > 0 && (
          <span className="ml-auto text-xs text-gray-400">{documents.length} sənəd layihəsi</span>
        )}
      </div>

      <div className="p-4">
        {loading ? (
          <div className="flex items-center justify-center py-12 text-gray-400">
            <Loader2 className="w-5 h-5 animate-spin mr-2" />
            <span className="text-sm">Yüklənir...</span>
          </div>
        ) : error ? (
          <div className="text-center py-12 text-red-500 text-sm">{error}</div>
        ) : documents.length === 0 ? (
          <div className="text-center py-12">
            <FileText className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-sm text-gray-400">Hələ heç bir sənəd layihəsi yaradılmayıb</p>
            <p className="text-xs text-gray-300 mt-1">Yeni sənəd layihəsi yaratmaq üçün yuxarıdakı formu doldurun</p>
          </div>
        ) : (
          <div className="space-y-2">
            {documents.map(doc => (
              <HistoryItem key={doc.id} doc={doc} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

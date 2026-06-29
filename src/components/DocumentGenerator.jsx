import { useState } from 'react'
import { FileText, Download, Loader2, Sparkles, ChevronDown } from 'lucide-react'
import { generateDocument, DOCUMENT_LABELS } from '../lib/claude'
import { supabase } from '../lib/supabase'
import { generatePdfFromText } from '../lib/pdfUtils'
import DocumentPreview from './DocumentPreview'
import PhotoUpload from './PhotoUpload'
import RiskAssessmentForm from './RiskAssessmentForm'

const DOCUMENT_TYPES = [
  { value: 'near_miss', label: 'Yaxın-Qaçış Hesabatı' },
  { value: 'toolbox_talk', label: 'Brifinq Qeydi' },
  { value: 'incident_report', label: 'Hadisə Hesabatı' },
  { value: 'permit_to_work', label: 'İş İcazəsi' },
]

const DEMO_SCENARIOS = [
  {
    label: 'Yaxın-qaçış: Forklift',
    type: 'near_miss',
    text: 'Bu səhər saat 10:30-da istehsalat sahəsində forklift dar keçiddən keçərkən piyada işçiyə az qala toxunurdu. İşçi vaxtında geri çəkildi, xəsarət olmadı.',
  },
  {
    label: 'Hadisə: İstehsalat sexi',
    type: 'incident_report',
    text: 'İstehsalat sexində işçi metal hissəni əl ilə qaldırarkən belini incitdi. İlk yardım göstərildi, iş müvəqqəti dayandırıldı.',
  },
  {
    label: 'Brifinq: Dəzgah təhlükəsizliyi',
    type: 'toolbox_talk',
    text: 'Bu gün səhər brifinqində dəzgahlarla işləyərkən mühafizə örtüklərinin istifadəsi, qoruyucu eynək və əlcəyin vacibliyi barədə işçilərə məlumat verilməlidir.',
  },
  {
    label: 'İş icazəsi: İsti iş',
    type: 'permit_to_work',
    text: 'Anbarda elektrik xətlərinin təmiri üçün isti iş (qaynaq) aparılacaq. 3 işçi iştirak edəcək, qaynaq maskası, alov gecikdirici geyim, odsöndürən və ventilyasiya tələb olunur.',
  },
]

export default function DocumentGenerator({ userId, onDocumentSaved }) {
  const [mode, setMode] = useState('incident') // 'incident' | 'risk_assessment'

  // Incident report state
  const [inputText, setInputText] = useState('')
  const [documentType, setDocumentType] = useState('incident_report')
  const [generatedDoc, setGeneratedDoc] = useState(null)
  const [generatedType, setGeneratedType] = useState(null)
  const [loading, setLoading] = useState(false)
  const [pdfLoading, setPdfLoading] = useState(false)
  const [error, setError] = useState(null)
  const [pdfError, setPdfError] = useState(null)
  const [photos, setPhotos] = useState([])

  function addFiles(imageFiles) {
    setPhotos(prev => {
      const slots = 5 - prev.length
      return [
        ...prev,
        ...imageFiles.slice(0, slots).map(file => ({ file, previewUrl: URL.createObjectURL(file) })),
      ]
    })
  }

  function removePhoto(index) {
    setPhotos(prev => {
      URL.revokeObjectURL(prev[index].previewUrl)
      return prev.filter((_, i) => i !== index)
    })
  }

  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result.split(',')[1])
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
  }

  function applyScenario(scenario) {
    setInputText(scenario.text)
    setDocumentType(scenario.type)
    setGeneratedDoc(null)
    setError(null)
    setPdfError(null)
  }

  async function handleGenerate() {
    if (!inputText.trim()) return
    setLoading(true)
    setError(null)
    setGeneratedDoc(null)
    setPdfError(null)

    try {
      const images = await Promise.all(
        photos.map(async ({ file }) => ({
          media_type: file.type,
          data: await fileToBase64(file),
        }))
      )
      const output = await generateDocument(inputText, documentType, images)
      setGeneratedDoc(output)
      setGeneratedType(documentType)

      const { error: saveError } = await supabase.from('documents').insert({
        user_id: userId,
        document_type: documentType,
        input_text: inputText,
        generated_output: output,
      })

      if (saveError) console.error('Save error:', saveError)
      else if (onDocumentSaved) onDocumentSaved()
    } catch (err) {
      setError(err.message || 'Sənəd layihəsi yaradılarkən xəta baş verdi.')
    } finally {
      setLoading(false)
    }
  }

  async function handleDownloadPdf() {
    if (!generatedDoc) return
    setPdfLoading(true)
    setPdfError(null)

    try {
      await generatePdfFromText(generatedDoc, generatedType)
    } catch (err) {
      setPdfError('PDF xətası: ' + err.message)
    } finally {
      setPdfLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Mode selector */}
      <div className="flex gap-1 p-1 bg-gray-100 rounded-xl w-fit">
        <button
          onClick={() => setMode('incident')}
          className={`px-4 py-2 text-sm font-medium rounded-lg transition ${
            mode === 'incident'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Incident Report
        </button>
        <button
          onClick={() => setMode('risk_assessment')}
          className={`px-4 py-2 text-sm font-medium rounded-lg transition ${
            mode === 'risk_assessment'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Risk Assessment
        </button>
      </div>

      {mode === 'risk_assessment' ? (
        <RiskAssessmentForm userId={userId} onDocumentSaved={onDocumentSaved} />
      ) : (
        <>
          {/* Form card */}
          <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
            <div className="flex items-center gap-2 mb-5">
              <Sparkles className="w-5 h-5 text-blue-600" />
              <h2 className="text-base font-semibold text-gray-900">Yeni SƏTƏM Sənəd Layihəsi</h2>
            </div>

            <div className="space-y-4">
              {/* Document type */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Sənəd layihəsinin növü
                </label>
                <div className="relative">
                  <select
                    value={documentType}
                    onChange={e => setDocumentType(e.target.value)}
                    className="w-full appearance-none px-4 py-2.5 pr-10 rounded-lg border border-gray-300 bg-white text-gray-900 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition cursor-pointer"
                  >
                    {DOCUMENT_TYPES.map(t => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                </div>
              </div>

              {/* Demo scenarios */}
              <div>
                <p className="text-xs text-gray-400 mb-2">Nümunə ssenarilər:</p>
                <div className="flex flex-wrap gap-2">
                  {DEMO_SCENARIOS.map(s => (
                    <button
                      key={s.label}
                      onClick={() => applyScenario(s)}
                      className="px-3 py-1.5 text-xs text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50 hover:border-gray-400 transition"
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Textarea */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  İş və ya hadisənin təsviri
                </label>
                <textarea
                  value={inputText}
                  onChange={e => setInputText(e.target.value)}
                  placeholder="İş prosesini, hadisəni və ya təhlükəni Azərbaycan dilində sadə şəkildə təsvir edin..."
                  rows={5}
                  className="w-full px-4 py-3 rounded-lg border border-gray-300 bg-white text-gray-900 text-sm placeholder-gray-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition resize-none"
                />
              </div>

              {/* Photo upload */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Sahə fotoları <span className="text-gray-400 font-normal">(maksimum 5)</span>
                </label>
                <PhotoUpload photos={photos} onAdd={addFiles} onRemove={removePhoto} maxPhotos={5} />
              </div>

              {error && (
                <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
                  {error}
                </div>
              )}

              <button
                onClick={handleGenerate}
                disabled={loading || !inputText.trim()}
                className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-lg transition text-sm"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Sənəd layihəsi hazırlanır...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    Sənəd Layihəsi Yarat
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Generated document */}
          {generatedDoc && (
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-green-600" />
                  <span className="text-sm font-semibold text-gray-900">
                    {DOCUMENT_LABELS[generatedType]}
                  </span>
                  <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
                    Hazırdır
                  </span>
                </div>
                <button
                  onClick={handleDownloadPdf}
                  disabled={pdfLoading}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-900 hover:bg-gray-800 disabled:opacity-50 text-white text-xs font-medium rounded-lg transition"
                >
                  {pdfLoading ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Download className="w-3.5 h-3.5" />
                  )}
                  PDF Yüklə
                </button>
              </div>

              {pdfError && (
                <div className="mx-6 mt-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
                  {pdfError}
                </div>
              )}

              <DocumentPreview text={generatedDoc} documentType={generatedType} />
            </div>
          )}
        </>
      )}
    </div>
  )
}

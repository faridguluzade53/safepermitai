import { useState } from 'react'
import { FileText, Download, Loader2, Sparkles, AlertTriangle } from 'lucide-react'
import { generateRiskAssessment } from '../lib/claude'
import { generateRiskAssessmentPdf } from '../lib/pdfUtils'
import { supabase } from '../lib/supabase'
import PhotoUpload from './PhotoUpload'

const RISK_COLORS = {
  critical: 'bg-red-100 text-red-800 border-red-200',
  high: 'bg-orange-100 text-orange-800 border-orange-200',
  medium: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  low: 'bg-green-100 text-green-800 border-green-200',
}

function riskColorClass(level) {
  const key = String(level).toLowerCase()
  return RISK_COLORS[key] || RISK_COLORS.low
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result.split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

function RiskAssessmentPreview({ data }) {
  const wd = data.workDetails || {}
  const hazards = Array.isArray(data.hazards) ? data.hazards : []

  return (
    <div className="p-6 space-y-6">
      {/* Work details */}
      <div>
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">İş Təfərrüatları</h3>
        <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
          {[
            ['İş təsviri', wd.description || wd.workDescription],
            ['Yer', wd.location],
            ['Tarix', wd.date],
            ['Məsul şəxs', wd.responsiblePerson],
            ['İşçi sayı', wd.workerCount],
          ].filter(([, v]) => v).map(([label, value]) => (
            <div key={label} className="flex gap-2">
              <span className="text-gray-500 font-medium shrink-0">{label}:</span>
              <span className="text-gray-900">{value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Hazard table */}
      {hazards.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Təhlükə Cədvəli</h3>
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-[#1e3a5f] text-white">
                  {['Təhlükə', 'Təsirlənənlər', 'Ehtimal', 'Ağırlıq', 'Bal', 'Səviyyə', 'Nəzarət Tədbirləri'].map(h => (
                    <th key={h} className="px-3 py-2 text-left font-semibold whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {hazards.map((hz, i) => (
                  <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                    <td className="px-3 py-2 font-medium text-gray-900">{hz.hazard}</td>
                    <td className="px-3 py-2 text-gray-700">{hz.affectedPersons}</td>
                    <td className="px-3 py-2 text-center text-gray-700">{hz.likelihood}</td>
                    <td className="px-3 py-2 text-center text-gray-700">{hz.severity}</td>
                    <td className="px-3 py-2 text-center font-semibold text-gray-900">{hz.riskScore}</td>
                    <td className="px-3 py-2">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold border ${riskColorClass(hz.riskLevel)}`}>
                        {hz.riskLevel}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-gray-700">{hz.controlMeasures}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Overall risk */}
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium text-gray-700">Ümumi Risk Səviyyəsi:</span>
        <span className={`inline-flex px-3 py-1 rounded-full text-sm font-semibold border ${riskColorClass(data.overallRiskLevel)}`}>
          {data.overallRiskLevel}
        </span>
      </div>

      {/* Summary */}
      {data.summary && (
        <p className="text-sm text-gray-700 leading-relaxed border-t border-gray-100 pt-4">{data.summary}</p>
      )}

      {/* Sign-off */}
      <div className="border-t border-gray-100 pt-4">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">İmzalar</h3>
        <div className="grid grid-cols-3 gap-4">
          {['Məsul şəxs', 'SƏTƏM məsulu', 'Layihə meneceri'].map(role => (
            <div key={role} className="space-y-1">
              <p className="text-xs font-medium text-gray-600">{role}</p>
              <div className="border-b border-gray-300 pb-1 h-6" />
              <p className="text-xs text-gray-400">İmza / Tarix</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default function RiskAssessmentForm({ userId, onDocumentSaved }) {
  const [workDescription, setWorkDescription] = useState('')
  const [location, setLocation] = useState('')
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [responsiblePerson, setResponsiblePerson] = useState('')
  const [workerCount, setWorkerCount] = useState('')
  const [photos, setPhotos] = useState([])
  const [loading, setLoading] = useState(false)
  const [pdfLoading, setPdfLoading] = useState(false)
  const [error, setError] = useState(null)
  const [pdfError, setPdfError] = useState(null)
  const [generatedData, setGeneratedData] = useState(null)

  function addFiles(imageFiles) {
    setPhotos(prev => {
      const slots = 3 - prev.length
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

  async function handleGenerate() {
    if (!workDescription.trim()) return
    setLoading(true)
    setError(null)
    setGeneratedData(null)
    setPdfError(null)

    try {
      const images = await Promise.all(
        photos.map(async ({ file }) => ({
          media_type: file.type,
          data: await fileToBase64(file),
        }))
      )

      const formData = {
        workDescription: workDescription.trim(),
        location: location.trim(),
        date,
        responsiblePerson: responsiblePerson.trim(),
        workerCount: parseInt(workerCount) || 0,
      }

      const result = await generateRiskAssessment(formData, images)
      setGeneratedData(result)

      const { error: saveError } = await supabase.from('risk_assessments').insert({
        user_id: userId,
        work_description: formData.workDescription,
        location: formData.location || null,
        date: formData.date || null,
        responsible_person: formData.responsiblePerson || null,
        worker_count: formData.workerCount || null,
        generated_content: result,
      })

      if (saveError) console.error('Save error:', saveError)
      else if (onDocumentSaved) onDocumentSaved()
    } catch (err) {
      setError(err.message || 'Risk qiymətləndirməsi yaradılarkən xəta baş verdi.')
    } finally {
      setLoading(false)
    }
  }

  async function handleDownloadPdf() {
    if (!generatedData) return
    setPdfLoading(true)
    setPdfError(null)
    try {
      await generateRiskAssessmentPdf(generatedData)
    } catch (err) {
      setPdfError('PDF xətası: ' + err.message)
    } finally {
      setPdfLoading(false)
    }
  }

  const inputClass = 'w-full px-3.5 py-2.5 rounded-lg border border-gray-300 bg-white text-gray-900 text-sm placeholder-gray-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition'

  return (
    <div className="space-y-6">
      {/* Form card */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
        <div className="flex items-center gap-2 mb-5">
          <AlertTriangle className="w-5 h-5 text-orange-500" />
          <h2 className="text-base font-semibold text-gray-900">Yeni Risk Qiymətləndirməsi</h2>
        </div>

        <div className="space-y-4">
          {/* Work description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              İş təsviri <span className="text-red-500">*</span>
            </label>
            <textarea
              value={workDescription}
              onChange={e => setWorkDescription(e.target.value)}
              placeholder="Görüləcək işi ətraflı təsvir edin..."
              rows={4}
              className={`${inputClass} resize-none`}
            />
          </div>

          {/* Location + Date */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Yer</label>
              <input
                type="text"
                value={location}
                onChange={e => setLocation(e.target.value)}
                placeholder="İstehsalat sahəsi, sex, anbar..."
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Tarix</label>
              <input
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                className={inputClass}
              />
            </div>
          </div>

          {/* Responsible person + Worker count */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Məsul şəxsin adı</label>
              <input
                type="text"
                value={responsiblePerson}
                onChange={e => setResponsiblePerson(e.target.value)}
                placeholder="Ad Soyad"
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">İşçi sayı</label>
              <input
                type="number"
                min="1"
                value={workerCount}
                onChange={e => setWorkerCount(e.target.value)}
                placeholder="0"
                className={inputClass}
              />
            </div>
          </div>

          {/* Photo upload */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Sahə fotoları <span className="text-gray-400 font-normal">(maksimum 3)</span>
            </label>
            <PhotoUpload photos={photos} onAdd={addFiles} onRemove={removePhoto} maxPhotos={3} />
          </div>

          {error && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
              {error}
            </div>
          )}

          <button
            onClick={handleGenerate}
            disabled={loading || !workDescription.trim()}
            className="flex items-center gap-2 px-5 py-2.5 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-lg transition text-sm"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Risk qiymətləndirməsi hazırlanır...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                Risk Qiymətləndirməsi Yarat
              </>
            )}
          </button>
        </div>
      </div>

      {/* Generated result */}
      {generatedData && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-green-600" />
              <span className="text-sm font-semibold text-gray-900">Risk Qiymətləndirməsi</span>
              <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
                Hazırdır
              </span>
            </div>
            <button
              onClick={handleDownloadPdf}
              disabled={pdfLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-900 hover:bg-gray-800 disabled:opacity-50 text-white text-xs font-medium rounded-lg transition"
            >
              {pdfLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
              PDF Yüklə
            </button>
          </div>

          {pdfError && (
            <div className="mx-6 mt-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
              {pdfError}
            </div>
          )}

          <RiskAssessmentPreview data={generatedData} />
        </div>
      )}
    </div>
  )
}

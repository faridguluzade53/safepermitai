import { useRef, useState } from 'react'
import { Upload, X } from 'lucide-react'

export default function PhotoUpload({ photos, onAdd, onRemove, maxPhotos = 5 }) {
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef(null)

  function handleFiles(fileList) {
    const imageFiles = Array.from(fileList).filter(f => f.type.startsWith('image/'))
    onAdd(imageFiles)
  }

  const atMax = photos.length >= maxPhotos

  return (
    <div>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={e => { handleFiles(e.target.files); e.target.value = '' }}
      />
      <div
        onClick={() => !atMax && fileInputRef.current.click()}
        onDragOver={e => { e.preventDefault(); setIsDragging(true) }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={e => { e.preventDefault(); setIsDragging(false); handleFiles(e.dataTransfer.files) }}
        className={`flex flex-col items-center justify-center gap-2 px-4 py-5 rounded-lg border-2 border-dashed transition ${
          isDragging
            ? 'border-blue-400 bg-blue-50'
            : atMax
            ? 'border-gray-200 bg-gray-50 cursor-not-allowed opacity-60'
            : 'border-gray-300 bg-white hover:border-blue-400 hover:bg-blue-50 cursor-pointer'
        }`}
      >
        <Upload className="w-5 h-5 text-gray-400" />
        <p className="text-xs text-gray-500 text-center">
          {atMax
            ? 'Maksimum foto sayına çatdınız'
            : `Fotoları sürükləyin və ya seçmək üçün klikləyin (maks. ${maxPhotos})`}
        </p>
      </div>

      {photos.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-2">
          {photos.map(({ previewUrl }, i) => (
            <div key={i} className="relative group w-16 h-16">
              <img
                src={previewUrl}
                alt=""
                className="w-full h-full object-cover rounded-lg border border-gray-200"
              />
              <button
                type="button"
                onClick={() => onRemove(i)}
                className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-gray-800 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition"
              >
                <X className="w-3 h-3 text-white" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

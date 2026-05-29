import { useState } from 'react'
import DocumentGenerator from './DocumentGenerator'
import DocumentHistory from './DocumentHistory'
import Sidebar from './Sidebar'

export default function Dashboard({ session }) {
  const [page, setPage] = useState('dashboard')
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0)

  function handleDocumentSaved() {
    setHistoryRefreshKey(k => k + 1)
  }

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar
        currentPage={page}
        onNavigate={setPage}
        userEmail={session.user.email}
      />

      {/* Main content offset by sidebar width */}
      <main className="flex-1 ml-60 min-h-screen">
        <div className="max-w-4xl mx-auto px-6 py-8">
          {/* Page header */}
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-gray-900">
              {page === 'dashboard' ? 'İdarə Paneli' : 'Sənəd Layihələri Tarixi'}
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              {page === 'dashboard'
                ? 'Tikinti üzrə yoxlanılmalı SƏTƏM sənəd layihələri hazırlayın və ya keçmiş layihələrə baxın'
                : 'Bütün hazırlanmış SƏTƏM sənəd layihələrinin siyahısı'}
            </p>
          </div>

          {page === 'dashboard' ? (
            <div className="space-y-6">
              <DocumentGenerator
                userId={session.user.id}
                onDocumentSaved={handleDocumentSaved}
              />
              <DocumentHistory
                userId={session.user.id}
                refreshKey={historyRefreshKey}
              />
            </div>
          ) : (
            <DocumentHistory
              userId={session.user.id}
              refreshKey={historyRefreshKey}
            />
          )}
        </div>
      </main>
    </div>
  )
}

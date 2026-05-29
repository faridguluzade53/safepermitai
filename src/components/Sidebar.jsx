import { ShieldCheck, LayoutDashboard, Clock, LogOut } from 'lucide-react'
import { supabase } from '../lib/supabase'

export default function Sidebar({ currentPage, onNavigate, userEmail }) {
  async function handleLogout() {
    await supabase.auth.signOut()
  }

  const navItems = [
    { id: 'dashboard', label: 'İdarə Paneli', icon: LayoutDashboard },
    { id: 'history', label: 'Layihə Tarixi', icon: Clock },
  ]

  return (
    <aside className="w-60 min-h-screen bg-gray-950 border-r border-gray-800 flex flex-col fixed top-0 left-0 z-10">
      {/* Brand */}
      <div className="px-5 py-6 border-b border-gray-800">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center flex-shrink-0">
            <ShieldCheck className="w-4 h-4 text-white" />
          </div>
          <div>
            <p className="text-white font-semibold text-sm leading-tight">SafePermit AI</p>
            <p className="text-gray-500 text-xs">Sənəd Layihələri</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => onNavigate(id)}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
              currentPage === id
                ? 'bg-blue-600/20 text-blue-400'
                : 'text-gray-400 hover:bg-gray-800 hover:text-white'
            }`}
          >
            <Icon className="w-4 h-4 flex-shrink-0" />
            {label}
          </button>
        ))}
      </nav>

      {/* User + Logout */}
      <div className="px-3 pb-4 border-t border-gray-800 pt-4">
        <div className="px-3 py-2 mb-2">
          <p className="text-xs text-gray-500 truncate">{userEmail}</p>
        </div>
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-400 hover:bg-gray-800 hover:text-white transition-colors"
        >
          <LogOut className="w-4 h-4 flex-shrink-0" />
          Çıxış
        </button>
      </div>
    </aside>
  )
}

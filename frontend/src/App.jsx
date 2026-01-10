import { useState } from 'react'
import SearchForm from './components/SearchForm'
import ResultsDisplay from './components/ResultsDisplay'
import Chatbot from './components/Chatbot'
import './App.css'

function App() {
  const [searchResults, setSearchResults] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [sortBy, setSortBy] = useState('price')

  const handleSearch = async (searchParams) => {
    setLoading(true)
    setError(null)
    setSortBy(searchParams.sortBy)
    
    try {
      const response = await fetch('/api/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(searchParams)
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.message || 'Failed to fetch travel options')
      }

      const data = await response.json()
      setSearchResults(data)
    } catch (err) {
      setError(err.message)
      console.error('Search error:', err)
    } finally {
      setLoading(false)
    }
  }

  // Handle sort change from results display
  const handleSortChange = (newSortBy) => {
    setSortBy(newSortBy)
    if (searchResults && searchResults.length > 0) {
      const sorted = [...searchResults].sort((a, b) => {
        if (newSortBy === 'price') {
          return (a.price || Infinity) - (b.price || Infinity)
        } else if (newSortBy === 'time') {
          return (a.durationMinutes || Infinity) - (b.durationMinutes || Infinity)
        }
        return 0
      })
      setSearchResults(sorted)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <h1 className="text-3xl font-bold text-indigo-600">🚀 Travel Hub</h1>
          <p className="text-gray-600 mt-1">Compare flights, trains, and buses in one place</p>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - Search Form & Results */}
          <div className="lg:col-span-2">
            <SearchForm onSearch={handleSearch} loading={loading} />
            
            {error && (
              <div className="mt-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-center gap-2">
                <svg className="w-5 h-5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
                <span>{error}</span>
              </div>
            )}

            <div className="mt-6">
              <ResultsDisplay 
                results={searchResults} 
                loading={loading} 
                sortBy={sortBy}
                onSortChange={handleSortChange}
              />
            </div>
          </div>

          {/* Right Column - Chatbot */}
          <div className="lg:col-span-1">
            <Chatbot />
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-white border-t mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <p className="text-center text-gray-500 text-sm">
            Travel Hub - SBHacks XII • Built for smart travel planning
          </p>
        </div>
      </footer>
    </div>
  )
}

export default App

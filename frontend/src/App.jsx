import { useState } from 'react'
import SearchForm from './components/SearchForm'
import ResultsDisplay from './components/ResultsDisplay'
import Chatbot from './components/Chatbot'
import './App.css'

function App() {
  const [searchResults, setSearchResults] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const handleSearch = async (startLocation, endLocation, sortBy) => {
    setLoading(true)
    setError(null)
    
    try {
      // TODO: Replace with actual API call
      const response = await fetch('/api/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          start: startLocation,
          end: endLocation,
          sortBy: sortBy || 'price'
        })
      })

      if (!response.ok) {
        throw new Error('Failed to fetch travel options')
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
          {/* Left Column - Search Form */}
          <div className="lg:col-span-2">
            <SearchForm onSearch={handleSearch} loading={loading} />
            
            {error && (
              <div className="mt-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
                {error}
              </div>
            )}

            <ResultsDisplay results={searchResults} loading={loading} />
          </div>

          {/* Right Column - Chatbot */}
          <div className="lg:col-span-1">
            <Chatbot />
          </div>
        </div>
      </main>
    </div>
  )
}

export default App


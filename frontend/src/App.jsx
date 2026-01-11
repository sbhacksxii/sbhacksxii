import { useState } from 'react'
import SearchForm from './components/SearchForm'
import ResultsDisplay from './components/ResultsDisplay'
import Chatbot from './components/Chatbot'
import logoImage from '../Basic_logo.png'
import './App.css'

function App() {
  const [searchResults, setSearchResults] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [sortBy, setSortBy] = useState('price')
  const [searchParams, setSearchParams] = useState(null)
  
  // Form state management for SearchForm
  const [formValues, setFormValues] = useState({
    from: '',
    to: '',
    departDate: '',
    returnDate: '',
    tripType: 'oneway',
    sortBy: 'price'
  })

  // API URL - uses environment variable in production
  // TODO: Replace with your actual Railway URL if env var isn't working
  const API_URL = 'https://sbhacksxii-production.up.railway.app'
  
  // Debug: Log the API URL on first render
  console.log('🔧 VITE_API_URL env:', import.meta.env.VITE_API_URL)
  console.log('🔧 Using API_URL:', API_URL)

  const handleSearch = async (searchParams) => {
    setLoading(true)
    setError(null)
    setSortBy(searchParams.sortBy)
    setSearchParams(searchParams)
    
    const apiEndpoint = `${API_URL}/api/search`
    console.log('🔍 Searching with API URL:', apiEndpoint)
    console.log('📦 Search params:', searchParams)
    
    try {
      const response = await fetch(apiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(searchParams)
      })

      console.log('📡 Response status:', response.status)

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        console.error('❌ API error response:', errorData)
        throw new Error(errorData.message || errorData.error || `Server error: ${response.status}`)
      }

      const data = await response.json()
      console.log('✅ Received data:', data.length, 'results')
      setSearchResults(data)
    } catch (err) {
      console.error('❌ Search error:', err)
      // More descriptive error messages
      if (err.message.includes('Failed to fetch') || err.message.includes('NetworkError')) {
        setError('Cannot connect to server. Please check if the backend is running.')
      } else if (err.message.includes('CORS')) {
        setError('CORS error - backend may not be configured to accept requests from this domain.')
      } else {
        setError(err.message)
      }
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

  // Callback for Chatbot to update form values
  const handleChatbotFormUpdate = (searchParams) => {
    if (searchParams) {
      setFormValues(prev => {
        const updated = {
          ...prev,
          ...searchParams
        }
        
        // Check if all required fields are filled after update
        const hasFrom = updated.from && updated.from.trim()
        const hasTo = updated.to && updated.to.trim()
        const hasDepartDate = updated.departDate && updated.departDate.trim()
        const hasTripType = updated.tripType
        const hasReturnDate = updated.tripType === 'roundtrip' 
          ? (updated.returnDate && updated.returnDate.trim())
          : true // Return date only required for round trips
        
        // If all required fields are present, trigger search automatically
        if (hasFrom && hasTo && hasDepartDate && hasTripType && hasReturnDate) {
          console.log('🤖 Auto-triggering search from chatbot form fill')
          // Use setTimeout to avoid state update issues
          setTimeout(() => {
            handleSearch({
              from: updated.from.trim(),
              to: updated.to.trim(),
              departDate: updated.departDate.trim(),
              returnDate: updated.tripType === 'roundtrip' ? updated.returnDate.trim() : null,
              tripType: updated.tripType,
              sortBy: updated.sortBy || 'price'
            })
          }, 100)
        }
        
        return updated
      })
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold text-indigo-600 flex items-center gap-2">
                <img src={logoImage} alt="Streamline Logo" className="h-8 w-8" />
                Streamline
              </h1>
              <p className="text-gray-600 mt-1">Compare flights and bus/train routes in one place</p>
            </div>
            <a 
              href="mailto:streamlinetravelhelp@gmail.com"
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
              title="Get help"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>Help</span>
            </a>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - Search Form & Results */}
          <div className="lg:col-span-2">
            <SearchForm 
              onSearch={handleSearch} 
              loading={loading}
              formValues={formValues}
              onFormValuesChange={setFormValues}
            />
            
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
                searchParams={searchParams}
              />
            </div>
          </div>

          {/* Right Column - Chatbot */}
          <div className="lg:col-span-1">
            <Chatbot onFormUpdate={handleChatbotFormUpdate} />
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-white border-t mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <p className="text-center text-gray-500 text-sm">
            Streamline - SBHacks XII • Built for smart travel planning
          </p>
        </div>
      </footer>
    </div>
  )
}

export default App

import { useState } from 'react'

function ResultsDisplay({ results, loading, sortBy, onSortChange, searchParams }) {
  const [showAll, setShowAll] = useState(false)

  // Build Google Flights URL from search parameters
  const buildGoogleFlightsUrl = () => {
    if (!searchParams) return 'https://www.google.com/travel/flights'
    
    const { from, to, departDate, returnDate, tripType } = searchParams
    
    // Format dates from YYYY-MM-DD to a format Google Flights understands
    // Google Flights uses YYYY-MM-DD format in the URL
    let query = `Flights from ${encodeURIComponent(from)} to ${encodeURIComponent(to)}`
    
    if (departDate) {
      query += ` on ${departDate}`
    }
    
    if (tripType === 'roundtrip' && returnDate) {
      query += ` returning on ${returnDate}`
    }
    
    return `https://www.google.com/travel/flights?q=${encodeURIComponent(query)}`
  }

  const handleGoogleFlightsClick = () => {
    const url = buildGoogleFlightsUrl()
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-md p-8 text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto"></div>
        <p className="mt-4 text-gray-600">Searching for travel options...</p>
        <p className="mt-2 text-sm text-gray-400">This may take a moment while we search for the best deals</p>
      </div>
    )
  }

  if (!results) {
    return (
      <div className="bg-white rounded-lg shadow-md p-8 text-center text-gray-500">
        <div className="text-4xl mb-4">✈️</div>
        <p className="font-medium">Ready to find your next trip?</p>
        <p className="text-sm mt-2">Enter your travel details above to search for options</p>
      </div>
    )
  }

  if (results.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-md p-8 text-center text-gray-500">
        <div className="text-4xl mb-4">🔍</div>
        <p className="font-medium">No flights found</p>
        <p className="text-sm mt-2">Try different dates or destinations</p>
      </div>
    )
  }

  const formatPrice = (price, currency = 'USD') => {
    if (!price) return 'N/A'
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(price)
  }

  const getStopsDisplay = (stops) => {
    if (!stops) return null
    if (stops.toLowerCase().includes('nonstop')) {
      return { text: 'Nonstop', className: 'text-green-600 bg-green-50' }
    }
    const num = stops.match(/\d+/)
    if (num) {
      return { 
        text: `${num[0]} stop${num[0] > 1 ? 's' : ''}`, 
        className: 'text-orange-600 bg-orange-50' 
      }
    }
    return { text: stops, className: 'text-gray-600 bg-gray-50' }
  }

  // Show top 3 or all results
  const displayResults = showAll ? results : results.slice(0, 3)
  const remainingCount = results.length - 3

  return (
    <div className="space-y-4">
      {/* Results Header */}
      <div className="bg-white rounded-lg shadow-md p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-gray-800">
            {results.length} flight{results.length !== 1 ? 's' : ''} found
          </h2>
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500">Sort by:</span>
            <select
              value={sortBy}
              onChange={(e) => onSortChange(e.target.value)}
              className="text-sm border border-gray-300 rounded-md px-2 py-1 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            >
              <option value="price">Price</option>
              <option value="time">Duration</option>
            </select>
          </div>
        </div>
      </div>

      {/* Flight Cards */}
      <div className="space-y-3">
        {displayResults.map((flight, index) => {
          const stopsInfo = getStopsDisplay(flight.stops)
          const isTopResult = index === 0
          
          return (
            <div
              key={index}
              className={`bg-white rounded-lg shadow-md overflow-hidden transition-all hover:shadow-lg ${
                isTopResult ? 'ring-2 ring-indigo-500' : ''
              }`}
            >
              {isTopResult && (
                <div className="bg-indigo-500 text-white text-xs font-medium px-3 py-1">
                  {sortBy === 'price' ? '💰 Best Price' : '⚡ Fastest'}
                </div>
              )}
              
              <div className="p-4">
                <div className="flex items-center justify-between">
                  {/* Left: Flight Info */}
                  <div className="flex-1">
                    {/* Airline */}
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-2xl">✈️</span>
                      <span className="font-semibold text-gray-800">
                        {flight.provider || 'Multiple Airlines'}
                      </span>
                    </div>
                    
                    {/* Time and Route */}
                    <div className="flex items-center gap-4">
                      {/* Departure */}
                      <div className="text-center">
                        <p className="text-xl font-bold text-gray-900">
                          {flight.departure?.time || '--:--'}
                        </p>
                        <p className="text-sm text-gray-500">
                          {flight.departure?.location || 'Origin'}
                        </p>
                      </div>
                      
                      {/* Flight Path Visual */}
                      <div className="flex-1 flex items-center px-4">
                        <div className="flex-1 border-t-2 border-gray-300 border-dashed relative">
                          <div className="absolute left-0 top-1/2 -translate-y-1/2 w-2 h-2 bg-gray-400 rounded-full"></div>
                          <div className="absolute right-0 top-1/2 -translate-y-1/2 w-2 h-2 bg-indigo-500 rounded-full"></div>
                          <div className="absolute left-1/2 -translate-x-1/2 -top-5 text-xs text-gray-500 whitespace-nowrap">
                            {flight.duration || 'N/A'}
                          </div>
                          {stopsInfo && (
                            <div className={`absolute left-1/2 -translate-x-1/2 top-2 text-xs px-2 py-0.5 rounded-full ${stopsInfo.className}`}>
                              {stopsInfo.text}
                            </div>
                          )}
                        </div>
                      </div>
                      
                      {/* Arrival */}
                      <div className="text-center">
                        <p className="text-xl font-bold text-gray-900">
                          {flight.arrival?.time || '--:--'}
                        </p>
                        <p className="text-sm text-gray-500">
                          {flight.arrival?.location || 'Destination'}
                        </p>
                      </div>
                    </div>
                    
                    {/* Bags Info */}
                    {flight.bags && (
                      <p className="text-xs text-gray-500 mt-2 flex items-center gap-1">
                        <span>🧳</span> {flight.bags}
                      </p>
                    )}
                  </div>
                  
                  {/* Right: Price */}
                  <div className="ml-6 text-right border-l pl-6 border-gray-200">
                    <p className="text-2xl font-bold text-indigo-600">
                      {formatPrice(flight.price, flight.currency)}
                    </p>
                    <p className="text-xs text-gray-500">
                      {flight.priceFormatted ? 'per person' : ''}
                    </p>
                    <button 
                      onClick={handleGoogleFlightsClick}
                      className="mt-2 bg-indigo-600 text-white text-sm px-4 py-2 rounded-md hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                      View on Google Flights
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Show More / Show Less Button */}
      {results.length > 3 && (
        <button
          onClick={() => setShowAll(!showAll)}
          className="w-full bg-white rounded-lg shadow-md p-4 text-indigo-600 font-medium hover:bg-indigo-50 transition-colors flex items-center justify-center gap-2"
        >
          {showAll ? (
            <>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
              </svg>
              Show fewer options
            </>
          ) : (
            <>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
              Show {remainingCount} more flight{remainingCount !== 1 ? 's' : ''}
            </>
          )}
        </button>
      )}
    </div>
  )
}

export default ResultsDisplay

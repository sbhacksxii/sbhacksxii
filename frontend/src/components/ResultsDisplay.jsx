import { useState } from 'react'

function ResultsDisplay({ results, loading, sortBy, onSortChange, searchParams }) {
  const [showAll, setShowAll] = useState(false)

  // Build Google Flights URL from search parameters
  const buildGoogleFlightsUrl = (from, to, departDate, returnDate = null) => {
    const fromLoc = from || searchParams?.from
    const toLoc = to || searchParams?.to
    const depDate = departDate || searchParams?.departDate
    const retDate = returnDate || (searchParams?.tripType === 'roundtrip' ? searchParams?.returnDate : null)
    
    if (!fromLoc || !toLoc) return 'https://www.google.com/travel/flights'
    
    let query = `Flights from ${encodeURIComponent(fromLoc)} to ${encodeURIComponent(toLoc)}`
    
    if (depDate) {
      query += ` on ${depDate}`
    }
    
    if (retDate) {
      query += ` returning on ${retDate}`
    }
    
    return `https://www.google.com/travel/flights?q=${encodeURIComponent(query)}`
  }

  // Get the appropriate URL for a flight result or leg
  const getFlightUrl = (item, fromLoc = null, toLoc = null, date = null) => {
    // Use stored fullUrl if available
    if (item?.fullUrl) return item.fullUrl
    // Otherwise build a URL from the search params or provided locations
    return buildGoogleFlightsUrl(
      fromLoc || item?.departure?.location,
      toLoc || item?.arrival?.location,
      date || item?.date || item?.departDate
    )
  }

  const handleGoogleFlightsClick = (url = null) => {
    const targetUrl = url || buildGoogleFlightsUrl()
    window.open(targetUrl, '_blank', 'noopener,noreferrer')
  }

  // Amtrak home URL
  const AMTRAK_URL = 'https://www.amtrak.com'

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-md p-8 text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto"></div>
        <p className="mt-4 text-gray-600">Looking for travel options...</p>
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
        <p className="font-medium">No travel options found</p>
        <p className="text-sm mt-2">Try different dates or destinations</p>
      </div>
    )
  }

  // Count flights, trains, connections, and mixed roundtrips
  const flights = results.filter(r => r.source === 'Google Flights')
  const trains = results.filter(r => r.source === 'Amtrak')
  const connections = results.filter(r => r.type === 'connection' || r.source === 'Connection')
  const mixedRoundtrips = results.filter(r => r.type === 'mixed-roundtrip')

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
          <div>
            <h2 className="text-xl font-semibold text-gray-800">
              {results.length} travel option{results.length !== 1 ? 's' : ''} found
            </h2>
            {(flights.length > 0 || trains.length > 0 || connections.length > 0 || mixedRoundtrips.length > 0) && (
              <p className="text-sm text-gray-500 mt-1">
                {flights.length > 0 && `${flights.length} flight${flights.length !== 1 ? 's' : ''}`}
                {flights.length > 0 && (trains.length > 0 || connections.length > 0 || mixedRoundtrips.length > 0) && ' • '}
                {trains.length > 0 && `${trains.length} bus/train route${trains.length !== 1 ? 's' : ''}`}
                {trains.length > 0 && (connections.length > 0 || mixedRoundtrips.length > 0) && ' • '}
                {connections.length > 0 && `${connections.length} connection${connections.length !== 1 ? 's' : ''}`}
                {connections.length > 0 && mixedRoundtrips.length > 0 && ' • '}
                {mixedRoundtrips.length > 0 && `${mixedRoundtrips.length} mixed roundtrip${mixedRoundtrips.length !== 1 ? 's' : ''}`}
              </p>
            )}
          </div>
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

      {/* Travel Option Cards */}
      <div className="space-y-3">
        {displayResults.map((result, index) => {
          const stopsInfo = getStopsDisplay(result.stops)
          const isTopResult = index === 0
          const isTrain = result.source === 'Amtrak'
          const isFlight = result.source === 'Google Flights'
          const isConnection = result.type === 'connection' || result.source === 'Connection'
          const isMixedRoundtrip = result.type === 'mixed-roundtrip'
          
          // Render mixed roundtrip (Amtrak+Flight or Flight+Amtrak)
          if (isMixedRoundtrip) {
            return (
              <div
                key={index}
                className={`bg-white rounded-lg shadow-md overflow-hidden transition-all hover:shadow-lg ${
                  isTopResult ? 'ring-2 ring-indigo-500' : ''
                } border-l-4 border-teal-500`}
              >
                {isTopResult && (
                  <div className="bg-indigo-500 text-white text-xs font-medium px-3 py-1">
                    {sortBy === 'price' ? '💰 Best Price' : '⚡ Fastest'}
                  </div>
                )}
                
                <div className="p-4">
                  <div className="flex items-center justify-between">
                    {/* Left: Travel Info */}
                    <div className="flex-1">
                      {/* Provider/Transport Type */}
                      <div className="flex items-center gap-2 mb-3">
                        <span className="text-2xl">🔀</span>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-gray-800">
                            {result.provider || 'Mixed Roundtrip'}
                          </span>
                          <span className="text-xs bg-teal-100 text-teal-800 px-2 py-1 rounded-full font-medium">
                            Mixed Roundtrip
                          </span>
                        </div>
                      </div>
                      
                      {/* Outbound Leg */}
                      <div className="space-y-3">
                        <div className="bg-gray-50 rounded-lg p-3">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-sm font-medium text-gray-700">
                              {result.outbound?.legType === 'train' ? '🚂 Outbound (Train)' : '✈️ Outbound (Flight)'}
                            </span>
                            <span className="text-xs text-gray-500">
                              {result.departDate}
                            </span>
                          </div>
                          <div className="flex items-center gap-4">
                            <div className="text-center min-w-[70px]">
                              <p className="text-lg font-bold text-gray-900">
                                {result.outbound?.departure?.time || '--:--'}
                              </p>
                              <p className="text-xs text-gray-500">
                                {result.outbound?.departure?.location || searchParams?.from}
                              </p>
                            </div>
                            
                            <div className="flex-1 flex items-center px-2">
                              <div className={`flex-1 border-t-2 ${result.outbound?.legType === 'train' ? 'border-blue-300' : 'border-gray-300 border-dashed'} relative`}>
                                <div className={`absolute left-0 top-1/2 -translate-y-1/2 w-2 h-2 ${result.outbound?.legType === 'train' ? 'bg-blue-400' : 'bg-gray-400'} rounded-full`}></div>
                                <div className={`absolute right-0 top-1/2 -translate-y-1/2 w-2 h-2 ${result.outbound?.legType === 'train' ? 'bg-blue-500' : 'bg-indigo-500'} rounded-full`}></div>
                                <div className="absolute left-1/2 -translate-x-1/2 -top-5 text-xs text-gray-500 whitespace-nowrap">
                                  {result.outbound?.duration || 'N/A'}
                                </div>
                              </div>
                            </div>
                            
                            <div className="text-center min-w-[70px]">
                              <p className="text-lg font-bold text-gray-900">
                                {result.outbound?.arrival?.time || '--:--'}
                              </p>
                              <p className="text-xs text-gray-500">
                                {result.outbound?.arrival?.location || searchParams?.to}
                              </p>
                            </div>
                            
                            <div className="text-right min-w-[60px]">
                              <p className={`text-sm font-semibold ${result.outbound?.legType === 'train' ? 'text-blue-600' : 'text-indigo-600'}`}>
                                {result.outbound?.priceFormatted || formatPrice(result.outbound?.price)}
                              </p>
                            </div>
                          </div>
                        </div>
                        
                        {/* Return Leg */}
                        <div className="bg-gray-50 rounded-lg p-3">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-sm font-medium text-gray-700">
                              {result.return?.legType === 'train' ? '🚂 Return (Train)' : '✈️ Return (Flight)'}
                            </span>
                            <span className="text-xs text-gray-500">
                              {result.returnDate}
                            </span>
                          </div>
                          <div className="flex items-center gap-4">
                            <div className="text-center min-w-[70px]">
                              <p className="text-lg font-bold text-gray-900">
                                {result.return?.departure?.time || '--:--'}
                              </p>
                              <p className="text-xs text-gray-500">
                                {result.return?.departure?.location || searchParams?.to}
                              </p>
                            </div>
                            
                            <div className="flex-1 flex items-center px-2">
                              <div className={`flex-1 border-t-2 ${result.return?.legType === 'train' ? 'border-blue-300' : 'border-gray-300 border-dashed'} relative`}>
                                <div className={`absolute left-0 top-1/2 -translate-y-1/2 w-2 h-2 ${result.return?.legType === 'train' ? 'bg-blue-400' : 'bg-gray-400'} rounded-full`}></div>
                                <div className={`absolute right-0 top-1/2 -translate-y-1/2 w-2 h-2 ${result.return?.legType === 'train' ? 'bg-blue-500' : 'bg-indigo-500'} rounded-full`}></div>
                                <div className="absolute left-1/2 -translate-x-1/2 -top-5 text-xs text-gray-500 whitespace-nowrap">
                                  {result.return?.duration || 'N/A'}
                                </div>
                              </div>
                            </div>
                            
                            <div className="text-center min-w-[70px]">
                              <p className="text-lg font-bold text-gray-900">
                                {result.return?.arrival?.time || '--:--'}
                              </p>
                              <p className="text-xs text-gray-500">
                                {result.return?.arrival?.location || searchParams?.from}
                              </p>
                            </div>
                            
                            <div className="text-right min-w-[60px]">
                              <p className={`text-sm font-semibold ${result.return?.legType === 'train' ? 'text-blue-600' : 'text-indigo-600'}`}>
                                {result.return?.priceFormatted || formatPrice(result.return?.price)}
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                      
                      {/* Total Duration */}
                      <div className="mt-3 pt-2 border-t border-gray-200">
                        <p className="text-xs text-gray-600">
                          Total travel time: <span className="font-semibold">{result.duration || 'N/A'}</span>
                        </p>
                      </div>
                    </div>
                    
                    {/* Right: Total Price */}
                    <div className="ml-6 text-right border-l pl-6 border-gray-200">
                      <p className="text-2xl font-bold text-teal-600">
                        {formatPrice(result.price, result.currency)}
                      </p>
                      <p className="text-xs text-gray-500">
                        total roundtrip
                      </p>
                      <div className="mt-3 space-y-1">
                        {/* Outbound booking link */}
                        {result.outbound?.source === 'Amtrak' ? (
                          <a 
                            href={AMTRAK_URL}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block bg-blue-600 text-white text-xs px-3 py-1.5 rounded-md hover:bg-blue-700 transition-colors text-center"
                          >
                            🚂 Book Outbound Amtrak
                          </a>
                        ) : result.outbound?.source === 'Google Flights' && (
                          <button 
                            onClick={() => handleGoogleFlightsClick(getFlightUrl(result.outbound))}
                            className="block w-full bg-indigo-600 text-white text-xs px-3 py-1.5 rounded-md hover:bg-indigo-700 transition-colors text-center"
                          >
                            ✈️ Book Outbound Flight
                          </button>
                        )}
                        
                        {/* Return booking link */}
                        {result.return?.source === 'Amtrak' ? (
                          <a 
                            href={AMTRAK_URL}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block bg-blue-600 text-white text-xs px-3 py-1.5 rounded-md hover:bg-blue-700 transition-colors text-center"
                          >
                            🚂 Book Return Amtrak
                          </a>
                        ) : result.return?.source === 'Google Flights' && (
                          <button 
                            onClick={() => handleGoogleFlightsClick(getFlightUrl(result.return))}
                            className="block w-full bg-indigo-600 text-white text-xs px-3 py-1.5 rounded-md hover:bg-indigo-700 transition-colors text-center"
                          >
                            ✈️ Book Return Flight
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )
          }
          
          // Render connection differently
          if (isConnection) {
            return (
              <div
                key={index}
                className={`bg-white rounded-lg shadow-md overflow-hidden transition-all hover:shadow-lg ${
                  isTopResult ? 'ring-2 ring-indigo-500' : ''
                } border-l-4 border-purple-500`}
              >
                {isTopResult && (
                  <div className="bg-indigo-500 text-white text-xs font-medium px-3 py-1">
                    {sortBy === 'price' ? '💰 Best Price' : '⚡ Fastest'}
                  </div>
                )}
                
                <div className="p-4">
                  <div className="flex items-center justify-between">
                    {/* Left: Travel Info */}
                    <div className="flex-1">
                      {/* Provider/Transport Type */}
                      <div className="flex items-center gap-2 mb-3">
                        <span className="text-2xl">🔗</span>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-gray-800">
                            {result.provider || 'Connection'}
                          </span>
                          <span className="text-xs bg-purple-100 text-purple-800 px-2 py-1 rounded-full font-medium">
                            Connection
                          </span>
                          {result.legs && result.legs.length > 0 && (
                            <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-full">
                              {result.legs.length} leg{result.legs.length > 1 ? 's' : ''}
                            </span>
                          )}
                        </div>
                      </div>
                      
                      {/* Connection Route with Multiple Legs */}
                      <div className="space-y-2">
                        {result.legs && result.legs.map((leg, legIndex) => {
                          const isLegTrain = leg.source === 'Amtrak'
                          const isLegFlight = leg.source === 'Google Flights'
                          
                          return (
                            <div key={legIndex} className="flex items-center gap-4">
                              {/* Departure */}
                              <div className="text-center min-w-[80px]">
                                <p className="text-lg font-bold text-gray-900">
                                  {leg.departure?.time || '--:--'}
                                </p>
                                <p className="text-xs text-gray-500">
                                  {leg.departure?.location || 'Origin'}
                                </p>
                              </div>
                              
                              {/* Path Visual */}
                              <div className="flex-1 flex items-center px-4">
                                <div className={`flex-1 border-t-2 ${isLegTrain ? 'border-blue-300 border-solid' : 'border-gray-300 border-dashed'} relative`}>
                                  <div className={`absolute left-0 top-1/2 -translate-y-1/2 w-2 h-2 ${isLegTrain ? 'bg-blue-400' : 'bg-gray-400'} rounded-full`}></div>
                                  <div className={`absolute right-0 top-1/2 -translate-y-1/2 w-2 h-2 ${isLegTrain ? 'bg-blue-500' : 'bg-indigo-500'} rounded-full`}></div>
                                  <div className="absolute left-1/2 -translate-x-1/2 -top-6 text-xs text-gray-500 whitespace-nowrap">
                                    {leg.duration || 'N/A'}
                                  </div>
                                  <div className="absolute left-1/2 -translate-x-1/2 top-2 text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                                    {isLegTrain ? '🚂 Train' : '✈️ Flight'}
                                  </div>
                                </div>
                              </div>
                              
                              {/* Arrival */}
                              <div className="text-center min-w-[80px]">
                                <p className="text-lg font-bold text-gray-900">
                                  {leg.arrival?.time || '--:--'}
                                </p>
                                <p className="text-xs text-gray-500">
                                  {leg.arrival?.location || 'Destination'}
                                </p>
                              </div>
                              
                              {/* Hub/Transfer Info */}
                              {legIndex < result.legs.length - 1 && result.hubs && result.hubs[legIndex] && (
                                <div className="ml-2 px-3 py-1 bg-purple-50 border border-purple-200 rounded-md">
                                  <p className="text-xs font-medium text-purple-700">
                                    Transfer: {result.hubs[legIndex].city}
                                  </p>
                                  <p className="text-xs text-purple-600">
                                    Wait: {Math.floor((result.hubs[legIndex].waitTimeMinutes || 0) / 60)}h {(result.hubs[legIndex].waitTimeMinutes || 0) % 60}m
                                  </p>
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                      
                      {/* Total Duration */}
                      <div className="mt-3 pt-2 border-t border-gray-200">
                        <p className="text-xs text-gray-600">
                          Total Duration: <span className="font-semibold">{result.duration || 'N/A'}</span>
                          {result.hubs && result.hubs.length > 0 && (
                            <span className="ml-2">
                              • {result.hubs.length} transfer{result.hubs.length > 1 ? 's' : ''}
                            </span>
                          )}
                        </p>
                      </div>
                    </div>
                    
                    {/* Right: Price & Booking Links */}
                    <div className="ml-6 text-right border-l pl-6 border-gray-200">
                      <p className="text-2xl font-bold text-purple-600">
                        {formatPrice(result.price, result.currency)}
                      </p>
                      <p className="text-xs text-gray-500 mb-2">
                        {result.priceFormatted ? 'total' : ''}
                      </p>
                      {/* Booking links for connection legs */}
                      <div className="mt-3 space-y-1">
                        {result.legs && result.legs.some(leg => leg.source === 'Amtrak') && (
                          <a 
                            href="https://www.amtrak.com"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block bg-blue-600 text-white text-xs px-3 py-1.5 rounded-md hover:bg-blue-700 transition-colors text-center"
                          >
                            🚂 Book Train on Amtrak
                          </a>
                        )}
                        {result.legs && result.legs.some(leg => leg.source === 'Google Flights') && (
                          <button 
                            onClick={handleGoogleFlightsClick}
                            className="block w-full bg-indigo-600 text-white text-xs px-3 py-1.5 rounded-md hover:bg-indigo-700 transition-colors text-center"
                          >
                            ✈️ View Flights
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )
          }
          
          // Regular flight/train display
          return (
            <div
              key={index}
              className={`bg-white rounded-lg shadow-md overflow-hidden transition-all hover:shadow-lg ${
                isTopResult ? 'ring-2 ring-indigo-500' : ''
              } ${isTrain ? 'border-l-4 border-blue-500' : ''}`}
            >
              {isTopResult && (
                <div className="bg-indigo-500 text-white text-xs font-medium px-3 py-1">
                  {sortBy === 'price' ? '💰 Best Price' : '⚡ Fastest'}
                </div>
              )}
              
              <div className="p-4">
                <div className="flex items-center justify-between">
                  {/* Left: Travel Info */}
                  <div className="flex-1">
                    {/* Provider/Transport Type */}
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-2xl">{isTrain ? '🚌' : '✈️'}</span>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-gray-800">
                          {result.provider || (isTrain ? 'Amtrak' : 'Multiple Airlines')}
                        </span>
                        {isTrain && (
                          <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-full font-medium">
                            Bus/Train
                          </span>
                        )}
                        {isFlight && (
                          <span className="text-xs bg-gray-100 text-gray-800 px-2 py-1 rounded-full font-medium">
                            Flight
                          </span>
                        )}
                      </div>
                    </div>
                    
                    {/* Time and Route */}
                    <div className="flex items-center gap-4">
                      {/* Departure */}
                      <div className="text-center">
                        <p className="text-xl font-bold text-gray-900">
                          {result.departure?.time || (isTrain ? '—' : '--:--')}
                        </p>
                        <p className="text-sm text-gray-500">
                          {result.departure?.location || 'Origin'}
                        </p>
                      </div>
                      
                      {/* Path Visual */}
                      <div className="flex-1 flex items-center px-4">
                        <div className={`flex-1 border-t-2 ${isTrain ? 'border-blue-300 border-solid' : 'border-gray-300 border-dashed'} relative`}>
                          <div className={`absolute left-0 top-1/2 -translate-y-1/2 w-2 h-2 ${isTrain ? 'bg-blue-400' : 'bg-gray-400'} rounded-full`}></div>
                          <div className={`absolute right-0 top-1/2 -translate-y-1/2 w-2 h-2 ${isTrain ? 'bg-blue-500' : 'bg-indigo-500'} rounded-full`}></div>
                          <div className="absolute left-1/2 -translate-x-1/2 -top-5 text-xs text-gray-500 whitespace-nowrap">
                            {result.duration || 'N/A'}
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
                          {result.arrival?.time || (isTrain ? '—' : '--:--')}
                        </p>
                        <p className="text-sm text-gray-500">
                          {result.arrival?.location || 'Destination'}
                        </p>
                      </div>
                    </div>
                    
                    {/* Additional Info */}
                    {result.bags && (
                      <p className="text-xs text-gray-500 mt-2 flex items-center gap-1">
                        <span>🧳</span> {result.bags}
                      </p>
                    )}
                    {isTrain && result.trainData && result.trainData.sampleCount > 1 && (
                      <p className="text-xs text-blue-600 mt-2">
                        Average of {result.trainData.sampleCount} similar routes
                        {result.trainData.priceRange && (
                          <span className="text-gray-500 ml-1">
                            (${result.trainData.priceRange.min} - ${result.trainData.priceRange.max})
                          </span>
                        )}
                      </p>
                    )}
                  </div>
                  
                  {/* Right: Price */}
                  <div className="ml-6 text-right border-l pl-6 border-gray-200">
                    <p className={`text-2xl font-bold ${isTrain ? 'text-blue-600' : 'text-indigo-600'}`}>
                      {formatPrice(result.price, result.currency)}
                    </p>
                    <p className="text-xs text-gray-500">
                      {result.priceFormatted ? 'per person' : ''}
                    </p>
                    {isFlight && (
                      <button 
                        onClick={() => handleGoogleFlightsClick(getFlightUrl(result))}
                        className="mt-2 bg-indigo-600 text-white text-sm px-4 py-2 rounded-md hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                        View on Google Flights
                      </button>
                    )}
                    {isTrain && (
                      <a 
                        href={AMTRAK_URL}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-2 inline-block bg-blue-600 text-white text-sm px-4 py-2 rounded-md hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                        Book on Amtrak
                      </a>
                    )}
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
              Show {remainingCount} more option{remainingCount !== 1 ? 's' : ''}
            </>
          )}
        </button>
      )}
    </div>
  )
}

export default ResultsDisplay

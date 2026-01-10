function ResultsDisplay({ results, loading }) {
  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-md p-8 text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto"></div>
        <p className="mt-4 text-gray-600">Searching for travel options...</p>
      </div>
    )
  }

  if (!results) {
    return (
      <div className="bg-white rounded-lg shadow-md p-8 text-center text-gray-500">
        <p>Enter locations above to search for travel options</p>
      </div>
    )
  }

  if (results.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-md p-8 text-center text-gray-500">
        <p>No travel options found. Try different locations.</p>
      </div>
    )
  }

  const getTransportIcon = (type) => {
    switch (type.toLowerCase()) {
      case 'flight':
        return '✈️'
      case 'train':
        return '🚂'
      case 'bus':
        return '🚌'
      default:
        return '🚗'
    }
  }

  const formatDuration = (duration) => {
    // Assuming duration is in minutes or a string like "5h 30m"
    return duration || 'N/A'
  }

  const formatPrice = (price, currency = 'USD') => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency
    }).format(price)
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h2 className="text-2xl font-semibold text-gray-800 mb-4">
        Travel Options ({results.length})
      </h2>
      
      <div className="space-y-4">
        {results.map((option, index) => (
          <div
            key={index}
            className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-2xl">{getTransportIcon(option.type)}</span>
                  <span className="font-semibold text-lg text-gray-800 capitalize">
                    {option.type}
                  </span>
                  {option.provider && (
                    <span className="text-sm text-gray-500">• {option.provider}</span>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4 mt-3">
                  <div>
                    <p className="text-sm text-gray-500">From</p>
                    <p className="font-medium">{option.departure?.location || 'N/A'}</p>
                    <p className="text-sm text-gray-500">
                      {option.departure?.time 
                        ? new Date(option.departure.time).toLocaleString()
                        : 'N/A'}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">To</p>
                    <p className="font-medium">{option.arrival?.location || 'N/A'}</p>
                    <p className="text-sm text-gray-500">
                      {option.arrival?.time 
                        ? new Date(option.arrival.time).toLocaleString()
                        : 'N/A'}
                    </p>
                  </div>
                </div>

                {option.stops !== undefined && (
                  <p className="text-sm text-gray-600 mt-2">
                    {option.stops === 0 ? 'Direct' : `${option.stops} stop(s)`}
                  </p>
                )}
              </div>

              <div className="text-right ml-4">
                <p className="text-2xl font-bold text-indigo-600">
                  {formatPrice(option.price, option.currency)}
                </p>
                <p className="text-sm text-gray-500 mt-1">
                  {formatDuration(option.duration)}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default ResultsDisplay


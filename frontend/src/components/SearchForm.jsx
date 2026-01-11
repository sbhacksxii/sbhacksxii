import { useState, useEffect } from 'react'

function SearchForm({ onSearch, loading, formValues, onFormValuesChange }) {
  // Use controlled props if provided, otherwise use internal state
  const [internalStartLocation, setInternalStartLocation] = useState('')
  const [internalEndLocation, setInternalEndLocation] = useState('')
  const [internalDepartDate, setInternalDepartDate] = useState('')
  const [internalReturnDate, setInternalReturnDate] = useState('')
  const [internalTripType, setInternalTripType] = useState('oneway')
  const [internalSortBy, setInternalSortBy] = useState('price')

  // Use controlled values if provided, otherwise use internal state
  const startLocation = formValues?.from ?? internalStartLocation
  const endLocation = formValues?.to ?? internalEndLocation
  const departDate = formValues?.departDate ?? internalDepartDate
  const returnDate = formValues?.returnDate ?? internalReturnDate
  const tripType = formValues?.tripType ?? internalTripType
  const sortBy = formValues?.sortBy ?? internalSortBy

  // Update internal state when controlled props change
  useEffect(() => {
    if (formValues) {
      if (formValues.from !== undefined) setInternalStartLocation(formValues.from)
      if (formValues.to !== undefined) setInternalEndLocation(formValues.to)
      if (formValues.departDate !== undefined) setInternalDepartDate(formValues.departDate)
      if (formValues.returnDate !== undefined) setInternalReturnDate(formValues.returnDate)
      if (formValues.tripType !== undefined) setInternalTripType(formValues.tripType)
      if (formValues.sortBy !== undefined) setInternalSortBy(formValues.sortBy)
    }
  }, [formValues])

  // Helper functions to update values
  const updateStartLocation = (value) => {
    setInternalStartLocation(value)
    if (onFormValuesChange && formValues) {
      onFormValuesChange({ ...formValues, from: value })
    }
  }
  const updateEndLocation = (value) => {
    setInternalEndLocation(value)
    if (onFormValuesChange && formValues) {
      onFormValuesChange({ ...formValues, to: value })
    }
  }
  const updateDepartDate = (value) => {
    setInternalDepartDate(value)
    if (onFormValuesChange && formValues) {
      onFormValuesChange({ ...formValues, departDate: value })
    }
  }
  const updateReturnDate = (value) => {
    setInternalReturnDate(value)
    if (onFormValuesChange && formValues) {
      onFormValuesChange({ ...formValues, returnDate: value })
    }
  }
  const updateTripType = (value) => {
    setInternalTripType(value)
    if (onFormValuesChange && formValues) {
      onFormValuesChange({ ...formValues, tripType: value })
    }
  }
  const updateSortBy = (value) => {
    setInternalSortBy(value)
    if (onFormValuesChange && formValues) {
      onFormValuesChange({ ...formValues, sortBy: value })
    }
  }

  // Get today's date in YYYY-MM-DD format for min date
  const today = new Date().toISOString().split('T')[0]

  const handleSubmit = (e) => {
    e.preventDefault()
    if (startLocation.trim() && endLocation.trim() && departDate) {
      onSearch({
        from: startLocation,
        to: endLocation,
        departDate,
        returnDate: tripType === 'roundtrip' ? returnDate : null,
        tripType,
        sortBy
      })
    }
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-6 mb-6">
      <h2 className="text-2xl font-semibold text-gray-800 mb-4">Search Travel Options</h2>
      
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Trip Type Toggle */}
        <div className="flex gap-4 mb-4">
          <label className="flex items-center cursor-pointer">
            <input
              type="radio"
              name="tripType"
              value="oneway"
              checked={tripType === 'oneway'}
              onChange={(e) => updateTripType(e.target.value)}
              className="mr-2 text-indigo-600 focus:ring-indigo-500"
            />
            <span className="text-sm font-medium text-gray-700">One Way</span>
          </label>
          <label className="flex items-center cursor-pointer">
            <input
              type="radio"
              name="tripType"
              value="roundtrip"
              checked={tripType === 'roundtrip'}
              onChange={(e) => updateTripType(e.target.value)}
              className="mr-2 text-indigo-600 focus:ring-indigo-500"
            />
            <span className="text-sm font-medium text-gray-700">Round Trip</span>
          </label>
        </div>

        {/* From / To Row */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="start" className="block text-sm font-medium text-gray-700 mb-1">
              From
            </label>
            <input
              type="text"
              id="start"
              value={startLocation}
              onChange={(e) => updateStartLocation(e.target.value)}
              placeholder="City or airport (e.g., LAX, Los Angeles)"
              className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              required
            />
          </div>

          <div>
            <label htmlFor="end" className="block text-sm font-medium text-gray-700 mb-1">
              To
            </label>
            <input
              type="text"
              id="end"
              value={endLocation}
              onChange={(e) => updateEndLocation(e.target.value)}
              placeholder="City or airport (e.g., JFK, New York)"
              className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              required
            />
          </div>
        </div>

        {/* Date Row */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="departDate" className="block text-sm font-medium text-gray-700 mb-1">
              Departure Date
            </label>
            <input
              type="date"
              id="departDate"
              value={departDate}
              onChange={(e) => updateDepartDate(e.target.value)}
              min={today}
              className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              required
            />
          </div>

          {tripType === 'roundtrip' && (
            <div>
              <label htmlFor="returnDate" className="block text-sm font-medium text-gray-700 mb-1">
                Return Date
              </label>
              <input
                type="date"
                id="returnDate"
                value={returnDate}
                onChange={(e) => updateReturnDate(e.target.value)}
                min={departDate || today}
                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                required={tripType === 'roundtrip'}
              />
            </div>
          )}
        </div>

        {/* Sort By */}
        <div>
          <label htmlFor="sortBy" className="block text-sm font-medium text-gray-700 mb-1">
            Sort By
          </label>
          <select
            id="sortBy"
            value={sortBy}
            onChange={(e) => updateSortBy(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          >
            <option value="price">Price (Lowest First)</option>
            <option value="time">Duration (Fastest First)</option>
          </select>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-indigo-600 text-white py-3 px-4 rounded-md font-medium hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              Searching flights...
            </span>
          ) : (
            '🔍 Search Travel Options'
          )}
        </button>
      </form>
    </div>
  )
}

export default SearchForm

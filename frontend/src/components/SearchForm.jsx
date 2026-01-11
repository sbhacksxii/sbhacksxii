import { useState, useEffect, useRef } from 'react'

// Autocomplete dropdown component
function LocationAutocomplete({ 
  id, 
  value, 
  onChange, 
  placeholder, 
  locations, 
  required 
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [inputValue, setInputValue] = useState(value || '')
  const [filteredLocations, setFilteredLocations] = useState([])
  const wrapperRef = useRef(null)
  const inputRef = useRef(null)

  // Update inputValue when value prop changes (for controlled component)
  useEffect(() => {
    if (value) {
      // Find the matching location to show its display name
      const match = locations.find(loc => loc.code === value)
      if (match) {
        setInputValue(`${match.code} - ${match.city} (${match.type === 'airport' ? '✈️' : '🚂'})`)
      } else {
        setInputValue(value)
      }
    } else {
      setInputValue('')
    }
  }, [value, locations])

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Filter locations based on input
  useEffect(() => {
    if (!inputValue.trim()) {
      setFilteredLocations(locations.slice(0, 20)) // Show first 20 when empty
    } else {
      const searchTerm = inputValue.toLowerCase()
      const filtered = locations.filter(loc => 
        loc.code.toLowerCase().includes(searchTerm) ||
        loc.city.toLowerCase().includes(searchTerm) ||
        loc.name.toLowerCase().includes(searchTerm) ||
        loc.state.toLowerCase().includes(searchTerm)
      ).slice(0, 15) // Limit results for performance
      setFilteredLocations(filtered)
    }
  }, [inputValue, locations])

  const handleInputChange = (e) => {
    const newValue = e.target.value
    setInputValue(newValue)
    setIsOpen(true)
    
    // If user clears the input, also clear the actual value
    if (!newValue.trim()) {
      onChange('')
    }
  }

  const handleSelect = (location) => {
    onChange(location.code)
    setInputValue(`${location.code} - ${location.city} (${location.type === 'airport' ? '✈️' : '🚂'})`)
    setIsOpen(false)
    inputRef.current?.blur()
  }

  const handleFocus = () => {
    setIsOpen(true)
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      setIsOpen(false)
      inputRef.current?.blur()
    } else if (e.key === 'Enter' && filteredLocations.length > 0) {
      e.preventDefault()
      handleSelect(filteredLocations[0])
    }
  }

  return (
    <div ref={wrapperRef} className="relative">
      <input
        ref={inputRef}
        type="text"
        id={id}
        value={inputValue}
        onChange={handleInputChange}
        onFocus={handleFocus}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
        required={required}
        autoComplete="off"
      />
      
      {isOpen && filteredLocations.length > 0 && (
        <ul className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-y-auto">
          {filteredLocations.map((location, index) => (
            <li
              key={`${location.code}-${location.type}-${index}`}
              onClick={() => handleSelect(location)}
              className="px-4 py-2 hover:bg-indigo-50 cursor-pointer flex items-center gap-2 border-b border-gray-100 last:border-b-0"
            >
              <span className="text-lg">
                {location.type === 'airport' ? '✈️' : '🚂'}
              </span>
              <div className="flex-1">
                <div className="font-medium text-gray-900">
                  {location.code} - {location.city}, {location.state}
                </div>
                <div className="text-xs text-gray-500">
                  {location.name}
                </div>
              </div>
              <span className={`text-xs px-2 py-0.5 rounded ${
                location.type === 'airport' 
                  ? 'bg-blue-100 text-blue-700' 
                  : 'bg-green-100 text-green-700'
              }`}>
                {location.type === 'airport' ? 'Airport' : 'Station'}
              </span>
            </li>
          ))}
        </ul>
      )}
      
      {isOpen && filteredLocations.length === 0 && inputValue.trim() && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg p-4 text-center text-gray-500">
          No airports or stations found matching "{inputValue}"
        </div>
      )}
    </div>
  )
}

function SearchForm({ onSearch, loading, formValues, onFormValuesChange }) {
  // Use controlled props if provided, otherwise use internal state
  const [internalStartLocation, setInternalStartLocation] = useState('')
  const [internalEndLocation, setInternalEndLocation] = useState('')
  const [internalDepartDate, setInternalDepartDate] = useState('')
  const [internalReturnDate, setInternalReturnDate] = useState('')
  const [internalTripType, setInternalTripType] = useState('oneway')
  const [internalSortBy, setInternalSortBy] = useState('price')
  
  // Locations data from API
  const [locations, setLocations] = useState([])
  const [locationsLoading, setLocationsLoading] = useState(true)

  // Use controlled values if provided, otherwise use internal state
  const startLocation = formValues?.from ?? internalStartLocation
  const endLocation = formValues?.to ?? internalEndLocation
  const departDate = formValues?.departDate ?? internalDepartDate
  const returnDate = formValues?.returnDate ?? internalReturnDate
  const tripType = formValues?.tripType ?? internalTripType
  const sortBy = formValues?.sortBy ?? internalSortBy

  // Fetch locations on mount
  useEffect(() => {
    const fetchLocations = async () => {
      try {
        // Use the same API URL pattern as the rest of the app
        const isProduction = window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1'
        const API_URL = isProduction 
          ? 'https://sbhacksxii-production.up.railway.app'
          : (import.meta.env.VITE_API_URL || '')
        
        const requestUrl = API_URL ? `${API_URL}/api/locations` : '/api/locations'
        console.log('Fetching locations from:', requestUrl)
        
        const response = await fetch(requestUrl)
        if (response.ok) {
          const data = await response.json()
          setLocations(data)
          console.log(`Loaded ${data.length} locations`)
        } else {
          console.error('Failed to fetch locations:', response.status)
        }
      } catch (error) {
        console.error('Error fetching locations:', error)
      } finally {
        setLocationsLoading(false)
      }
    }
    
    fetchLocations()
  }, [])

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
            {locationsLoading ? (
              <div className="w-full px-4 py-2 border border-gray-300 rounded-md bg-gray-50 text-gray-400">
                Loading locations...
              </div>
            ) : (
              <LocationAutocomplete
                id="start"
                value={startLocation}
                onChange={updateStartLocation}
                placeholder="Airport or station (e.g., LAX, SBA)"
                locations={locations}
                required
              />
            )}
          </div>

          <div>
            <label htmlFor="end" className="block text-sm font-medium text-gray-700 mb-1">
              To
            </label>
            {locationsLoading ? (
              <div className="w-full px-4 py-2 border border-gray-300 rounded-md bg-gray-50 text-gray-400">
                Loading locations...
              </div>
            ) : (
              <LocationAutocomplete
                id="end"
                value={endLocation}
                onChange={updateEndLocation}
                placeholder="Airport or station (e.g., JFK, NYP)"
                locations={locations}
                required
              />
            )}
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
          disabled={loading || locationsLoading}
          className="w-full bg-indigo-600 text-white py-3 px-4 rounded-md font-medium hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              Looking for travel options...
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

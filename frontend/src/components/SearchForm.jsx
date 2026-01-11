import { useState, useEffect, useRef } from 'react'

// Hardcoded list of airports and Amtrak stations
const LOCATIONS = [
  // Combined Airport + Amtrak Station (same code for both)
  { code: 'LAX', name: 'Los Angeles Airport & Union Station', city: 'Los Angeles', state: 'CA', type: 'both' },
  { code: 'SAN', name: 'San Diego Airport & Santa Fe Depot', city: 'San Diego', state: 'CA', type: 'both' },
  { code: 'DEN', name: 'Denver Airport & Union Station', city: 'Denver', state: 'CO', type: 'both' },
  { code: 'SLC', name: 'Salt Lake City Airport & Station', city: 'Salt Lake City', state: 'UT', type: 'both' },
  { code: 'SEA', name: 'Seattle Airport & King Street Station', city: 'Seattle', state: 'WA', type: 'both' },
  { code: 'PDX', name: 'Portland Airport & Union Station', city: 'Portland', state: 'OR', type: 'both' },
  { code: 'BOS', name: 'Boston Logan Airport & South Station', city: 'Boston', state: 'MA', type: 'both' },
  { code: 'PHL', name: 'Philadelphia Airport & 30th Street Station', city: 'Philadelphia', state: 'PA', type: 'both' },
  { code: 'SBA', name: 'Santa Barbara Airport & Station', city: 'Santa Barbara', state: 'CA', type: 'both' },
  { code: 'ABQ', name: 'Albuquerque Airport & Station', city: 'Albuquerque', state: 'NM', type: 'both' },
  { code: 'OMA', name: 'Omaha Airport & Station', city: 'Omaha', state: 'NE', type: 'both' },
  
  // Airports Only
  { code: 'SFO', name: 'San Francisco International Airport', city: 'San Francisco', state: 'CA', type: 'airport' },
  { code: 'OAK', name: 'Oakland International Airport', city: 'Oakland', state: 'CA', type: 'airport' },
  { code: 'SJC', name: 'San Jose International Airport', city: 'San Jose', state: 'CA', type: 'airport' },
  { code: 'ORD', name: "Chicago O'Hare International Airport", city: 'Chicago', state: 'IL', type: 'airport' },
  { code: 'DFW', name: 'Dallas/Fort Worth International Airport', city: 'Dallas', state: 'TX', type: 'airport' },
  { code: 'AUS', name: 'Austin-Bergstrom International Airport', city: 'Austin', state: 'TX', type: 'airport' },
  { code: 'IAH', name: 'George Bush Intercontinental Airport', city: 'Houston', state: 'TX', type: 'airport' },
  { code: 'MSY', name: 'Louis Armstrong New Orleans International Airport', city: 'New Orleans', state: 'LA', type: 'airport' },
  { code: 'ATL', name: 'Hartsfield-Jackson Atlanta International Airport', city: 'Atlanta', state: 'GA', type: 'airport' },
  { code: 'JFK', name: 'John F. Kennedy International Airport', city: 'New York', state: 'NY', type: 'airport' },
  { code: 'LGA', name: 'LaGuardia Airport', city: 'New York', state: 'NY', type: 'airport' },
  { code: 'EWR', name: 'Newark Liberty International Airport', city: 'Newark', state: 'NJ', type: 'airport' },
  { code: 'DCA', name: 'Ronald Reagan Washington National Airport', city: 'Washington DC', state: 'DC', type: 'airport' },
  { code: 'IAD', name: 'Washington Dulles International Airport', city: 'Washington DC', state: 'VA', type: 'airport' },
  { code: 'PHX', name: 'Phoenix Sky Harbor International Airport', city: 'Phoenix', state: 'AZ', type: 'airport' },
  { code: 'LAS', name: 'Harry Reid International Airport', city: 'Las Vegas', state: 'NV', type: 'airport' },
  { code: 'MIA', name: 'Miami International Airport', city: 'Miami', state: 'FL', type: 'airport' },
  { code: 'MCO', name: 'Orlando International Airport', city: 'Orlando', state: 'FL', type: 'airport' },
  { code: 'MSP', name: 'Minneapolis-Saint Paul International Airport', city: 'Minneapolis', state: 'MN', type: 'airport' },
  { code: 'DTW', name: 'Detroit Metropolitan Airport', city: 'Detroit', state: 'MI', type: 'airport' },
  { code: 'CLT', name: 'Charlotte Douglas International Airport', city: 'Charlotte', state: 'NC', type: 'airport' },
  
  // Amtrak Stations Only
  { code: 'SAC', name: 'Sacramento Valley Station', city: 'Sacramento', state: 'CA', type: 'station' },
  { code: 'SFC', name: 'San Francisco / Emeryville Station', city: 'San Francisco Bay Area', state: 'CA', type: 'station' },
  { code: 'CHI', name: 'Chicago Union Station', city: 'Chicago', state: 'IL', type: 'station' },
  { code: 'NYP', name: 'New York Penn Station', city: 'New York', state: 'NY', type: 'station' },
  { code: 'WAS', name: 'Washington Union Station', city: 'Washington', state: 'DC', type: 'station' },
  { code: 'NOL', name: 'New Orleans Union Passenger Terminal', city: 'New Orleans', state: 'LA', type: 'station' },
  { code: 'KYC', name: 'Kansas City Union Station', city: 'Kansas City', state: 'MO', type: 'station' },
  { code: 'SPK', name: 'Spokane Station', city: 'Spokane', state: 'WA', type: 'station' },
]

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

  // Helper to get icon for location type
  const getTypeIcon = (type) => {
    if (type === 'both') return '✈️🚂'
    if (type === 'airport') return '✈️'
    return '🚂'
  }

  // Update inputValue when value prop changes (for controlled component)
  useEffect(() => {
    if (value) {
      // Find the matching location to show its display name
      const match = locations.find(loc => loc.code === value)
      if (match) {
        setInputValue(`${match.code} - ${match.city} (${getTypeIcon(match.type)})`)
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
    setInputValue(`${location.code} - ${location.city} (${getTypeIcon(location.type)})`)
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
                {getTypeIcon(location.type)}
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
                location.type === 'both'
                  ? 'bg-purple-100 text-purple-700'
                  : location.type === 'airport' 
                    ? 'bg-blue-100 text-blue-700' 
                    : 'bg-green-100 text-green-700'
              }`}>
                {location.type === 'both' ? 'Airport + Station' : location.type === 'airport' ? 'Airport' : 'Station'}
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

  // Swap from and to locations
  const swapLocations = () => {
    const newFrom = endLocation
    const newTo = startLocation
    
    // Update both values together
    // If using controlled components, update both at once via onFormValuesChange
    if (onFormValuesChange && formValues) {
      onFormValuesChange({ 
        ...formValues, 
        from: newFrom,
        to: newTo
      })
    } else {
      // If using internal state, update both states
      setInternalStartLocation(newFrom)
      setInternalEndLocation(newTo)
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
        <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-4 items-end">
          <div>
            <label htmlFor="start" className="block text-sm font-medium text-gray-700 mb-1">
              From
            </label>
            <LocationAutocomplete
              id="start"
              value={startLocation}
              onChange={updateStartLocation}
              placeholder="Airport or station (e.g., LAX, SBA)"
              locations={LOCATIONS}
              required
            />
          </div>

          {/* Swap Button */}
          <div className="flex items-center justify-center pb-0 md:pb-0">
            <button
              type="button"
              onClick={swapLocations}
              className="p-2 rounded-md border border-gray-300 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition-colors"
              title="Swap origin and destination"
              aria-label="Swap origin and destination"
            >
              <svg 
                xmlns="http://www.w3.org/2000/svg" 
                className="h-5 w-5 text-gray-600" 
                fill="none" 
                viewBox="0 0 24 24" 
                stroke="currentColor"
              >
                <path 
                  strokeLinecap="round" 
                  strokeLinejoin="round" 
                  strokeWidth={2} 
                  d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" 
                />
              </svg>
            </button>
          </div>

          <div>
            <label htmlFor="end" className="block text-sm font-medium text-gray-700 mb-1">
              To
            </label>
            <LocationAutocomplete
              id="end"
              value={endLocation}
              onChange={updateEndLocation}
              placeholder="Airport or station (e.g., JFK, NYP)"
              locations={LOCATIONS}
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

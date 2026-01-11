import { useState, useRef, useEffect } from 'react'
import { createClient, LiveTranscriptionEvents } from '@deepgram/sdk'

function Chatbot({ onFormUpdate }) {
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: 'Hi! I can help you find the best travel options. ✈️🚂\n\nTry asking me things like:\n• "Find flights from LAX to JFK"\n• "Search for trains from NYC to Boston"\n• "What\'s the cheapest way from SFO to Seattle?"\n\nI can help you search airports and Amtrak stations - just tell me where you want to go!'
    }
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [isListening, setIsListening] = useState(false)
  const [currentTranscript, setCurrentTranscript] = useState('')
  const [isFinalTranscript, setIsFinalTranscript] = useState(false)
  const messagesEndRef = useRef(null)
  const messagesContainerRef = useRef(null)
  const mediaRecorderRef = useRef(null)
  const socketRef = useRef(null)
  const streamRef = useRef(null)
  const finalTranscriptTimeoutRef = useRef(null)
  const lastSubmittedTranscriptRef = useRef('')

  // Get Deepgram API key from environment variable
  const DEEPGRAM_API_KEY = import.meta.env.VITE_DEEPGRAM_API_KEY || ''

  const scrollToBottom = () => {
    // Scroll only within the chat container, not the entire page
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight
    }
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages, currentTranscript])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopRecording()
    }
  }, [])

  const stopRecording = () => {
    // Clear any pending timeout
    if (finalTranscriptTimeoutRef.current) {
      clearTimeout(finalTranscriptTimeoutRef.current)
      finalTranscriptTimeoutRef.current = null
    }
    
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
    }
    if (socketRef.current) {
      socketRef.current.finish()
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop())
    }
    setIsListening(false)
    setCurrentTranscript('')
    setIsFinalTranscript(false)
  }

  const startVoiceRecording = async () => {
    if (!DEEPGRAM_API_KEY) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Deepgram API key is not configured. Please set VITE_DEEPGRAM_API_KEY in your environment variables.'
      }])
      return
    }

    try {
      // Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          channelCount: 1,
          sampleRate: 16000,
        } 
      })
      streamRef.current = stream

      // Initialize Deepgram client
      const deepgram = createClient(DEEPGRAM_API_KEY)
      
      // Create live transcription connection
      const connection = deepgram.listen.live({
        model: 'nova-2',
        language: 'en-US',
        punctuate: true,
        interim_results: true,
        endpointing: 300,
        utterance_end_ms: 1000,
        smart_format: true,
      })

      // Set up MediaRecorder
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm',
      })
      mediaRecorderRef.current = mediaRecorder

      // Handle connection open
      connection.on(LiveTranscriptionEvents.Open, () => {
        console.log('Deepgram connection opened')
        setIsListening(true)
        mediaRecorder.start(250) // Send audio chunks every 250ms
      })

      // Handle transcript updates
      connection.on(LiveTranscriptionEvents.Transcript, (data) => {
        const transcript = data.channel?.alternatives?.[0]?.transcript
        const isFinal = data.is_final || false
        
        if (transcript) {
          setCurrentTranscript(transcript)
          setIsFinalTranscript(isFinal)
          
          // Clear any existing timeout
          if (finalTranscriptTimeoutRef.current) {
            clearTimeout(finalTranscriptTimeoutRef.current)
          }
          
          // If it's a final transcript, wait a bit then auto-submit
          if (isFinal && transcript.trim()) {
            finalTranscriptTimeoutRef.current = setTimeout(() => {
              // Submit the final transcript after a pause
              handleVoiceSubmit(transcript)
              stopRecording()
            }, 2000) // Wait 2 seconds after final transcript
          }
        }
      })

      // Handle errors
      connection.on(LiveTranscriptionEvents.Error, (error) => {
        console.error('Deepgram error:', error)
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: `Sorry, I encountered an error with voice recognition: ${error.message || 'Unknown error'}. Please try typing your message instead.`
        }])
        stopRecording()
      })

      // Handle connection close
      connection.on(LiveTranscriptionEvents.Close, () => {
        console.log('Deepgram connection closed')
        setIsListening(false)
      })

      // Send audio data to Deepgram
      mediaRecorder.addEventListener('dataavailable', (event) => {
        if (event.data.size > 0 && connection.getReadyState() === 1) {
          connection.send(event.data)
        }
      })

      socketRef.current = connection

    } catch (error) {
      console.error('Error starting voice recording:', error)
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `Sorry, I couldn't access your microphone: ${error.message}. Please check your browser permissions.`
      }])
      setIsListening(false)
    }
  }

  const toggleVoiceRecording = () => {
    if (isListening) {
      // Clear any pending timeout FIRST to prevent race condition
      if (finalTranscriptTimeoutRef.current) {
        clearTimeout(finalTranscriptTimeoutRef.current)
        finalTranscriptTimeoutRef.current = null
      }
      // Stop recording and submit current transcript if available
      if (currentTranscript.trim()) {
        handleVoiceSubmit(currentTranscript)
      }
      stopRecording()
    } else {
      startVoiceRecording()
    }
  }

  // Handle text message send
  const handleSend = async (e) => {
    e.preventDefault()
    if (!input.trim() || loading) return

    const userMessageText = input.trim()
    const userMessage = { role: 'user', content: userMessageText }
    setMessages(prev => [...prev, userMessage])
    setInput('')
    setLoading(true)

    await sendMessageToBackend(userMessageText)
  }

  // Handle voice transcript submission
  const handleVoiceSubmit = async (transcript) => {
    const trimmedTranscript = transcript.trim()
    if (!trimmedTranscript || loading) return
    
    // Prevent duplicate submissions of the same transcript
    if (lastSubmittedTranscriptRef.current === trimmedTranscript) {
      console.log('Chatbot: Duplicate transcript submission prevented:', trimmedTranscript)
      return
    }

    // Mark this transcript as submitted
    lastSubmittedTranscriptRef.current = trimmedTranscript

    const userMessage = { role: 'user', content: trimmedTranscript }
    setMessages(prev => [...prev, userMessage])
    setCurrentTranscript('')
    setLoading(true)

    await sendMessageToBackend(trimmedTranscript).finally(() => {
      // Reset the ref after submission completes to allow resubmission of different messages
      lastSubmittedTranscriptRef.current = ''
    })
  }

  // Send message to backend
  const sendMessageToBackend = async (messageText) => {
    // Use the same API URL as the search form in App.jsx
    // In production, use the hardcoded Railway URL; in dev, use proxy
    const isProduction = window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1'
    const API_URL = isProduction 
      ? 'https://sbhacksxii-production.up.railway.app'
      : (import.meta.env.VITE_API_URL || '') // Empty string uses Vite proxy in development
    
    // Build request URL - handle empty API_URL for proxy
    const requestUrl = API_URL ? `${API_URL}/api/chat` : '/api/chat'
    console.log('Chatbot: Sending request to:', requestUrl)
    
    try {
      const response = await fetch(requestUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          message: messageText,
          messages: messages // Pass conversation history for context
        })
      })

      console.log('Chatbot: Response status:', response.status)

      // Read response body once
      const responseText = await response.text()
      console.log('Chatbot: Response body:', responseText)

      if (!response.ok) {
        let errorData
        try {
          errorData = JSON.parse(responseText)
        } catch {
          errorData = { error: responseText || `HTTP ${response.status}` }
        }
        console.error('Chatbot: Error response:', errorData)
        
        // If backend returned an error response, use it
        if (errorData.response) {
          setMessages(prev => [...prev, { role: 'assistant', content: errorData.response }])
          // Still check for searchParams even in error responses
          if (errorData.searchParams && onFormUpdate) {
            console.log('Chatbot: Updating form with search parameters from error response:', errorData.searchParams)
            onFormUpdate(errorData.searchParams)
          }
          return
        }
        
        throw new Error(errorData.message || errorData.error || `HTTP ${response.status}: ${response.statusText}`)
      }

      // Parse the response as JSON
      let data
      try {
        data = JSON.parse(responseText)
      } catch (parseError) {
        console.error('Chatbot: Failed to parse JSON response:', parseError)
        throw new Error('Invalid response format from server')
      }
      
      console.log('Chatbot: Received data:', data)
      
      // Extract response text - handle both success and error formats
      const assistantResponse = data.response || data.message || data.error || 'Sorry, I couldn\'t generate a response. Please try again.'
      setMessages(prev => [...prev, { role: 'assistant', content: assistantResponse }])
      
      // If search parameters were extracted, update the form
      if (data.searchParams && onFormUpdate) {
        console.log('Chatbot: Updating form with search parameters:', data.searchParams)
        onFormUpdate(data.searchParams)
      }
    } catch (err) {
      console.error('Chatbot error:', err)
      console.error('Chatbot: Request URL was:', requestUrl)
      console.error('Chatbot: Full error:', err)
      
      // Handle different types of errors
      let errorMsg = err.message
      
      if (err.name === 'TypeError' && err.message.includes('fetch')) {
        errorMsg = `Network error: Unable to connect to the backend server. ${isProduction ? 'Please check if the backend is accessible at ' + API_URL : 'Please ensure the backend server is running on port 3001.'}`
      } else if (err.message.includes('404')) {
        errorMsg = `Endpoint not found (404). ${isProduction ? 'The backend URL may be incorrect or the endpoint doesn\'t exist at ' + API_URL : 'Please ensure the backend server is running on port 3001.'}`
      } else if (err.message.includes('500')) {
        errorMsg = `Backend server error (500). Please try again later.`
      } else if (err.message.includes('CORS')) {
        errorMsg = `CORS error: The backend server is blocking requests from this origin.`
      }
      
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `Sorry, I encountered an error: ${errorMsg}. Please try again later.`
      }])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-white rounded-lg shadow-md flex flex-col h-[600px]">
      <div className="p-4 border-b border-gray-200">
        <h2 className="text-xl font-semibold text-gray-800">💬 Travel Assistant</h2>
        {!DEEPGRAM_API_KEY && (
          <p className="text-xs text-red-500 mt-1">⚠️ Voice features require VITE_DEEPGRAM_API_KEY</p>
        )}
      </div>

      <div ref={messagesContainerRef} className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((message, index) => (
          <div
            key={index}
            className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[80%] rounded-lg px-4 py-2 ${
                message.role === 'user'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-100 text-gray-800'
              }`}
            >
              <p className="text-sm whitespace-pre-wrap">{message.content}</p>
            </div>
          </div>
        ))}

        {/* Show current voice transcript while speaking */}
        {currentTranscript && isListening && (
          <div className="flex justify-end">
            <div className={`max-w-[80%] rounded-lg px-4 py-2 ${
              isFinalTranscript 
                ? 'bg-indigo-500 text-white' 
                : 'bg-indigo-300 text-indigo-900'
            }`}>
              <p className="text-sm italic">{currentTranscript}</p>
              <p className="text-xs mt-1 opacity-75">
                {isFinalTranscript ? 'Final' : 'Listening...'}
              </p>
            </div>
          </div>
        )}
        
        {loading && (
          <div className="flex justify-start">
            <div className="bg-gray-100 rounded-lg px-4 py-2">
              <div className="flex space-x-1">
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
              </div>
            </div>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>

      <form onSubmit={handleSend} className="p-4 border-t border-gray-200">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about travel options..."
            className="flex-1 px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            disabled={loading || isListening}
          />
          {/* Voice recording button */}
          {DEEPGRAM_API_KEY && (
            <button
              type="button"
              onClick={toggleVoiceRecording}
              disabled={loading}
              className={`px-4 py-2 rounded-md font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition-colors ${
                isListening
                  ? 'bg-red-600 text-white hover:bg-red-700 animate-pulse'
                  : 'bg-gray-600 text-white hover:bg-gray-700'
              }`}
              title={isListening ? 'Stop recording' : 'Start voice recording'}
            >
              {isListening ? (
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8 7a1 1 0 012 0v4a1 1 0 11-2 0V7zM12 9a1 1 0 10-2 0v3a1 1 0 102 0V9z" clipRule="evenodd" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 00-2 0 7.001 7.001 0 006 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z" clipRule="evenodd" />
                </svg>
              )}
            </button>
          )}
          <button
            type="submit"
            disabled={loading || !input.trim() || isListening}
            className="bg-indigo-600 text-white px-6 py-2 rounded-md font-medium hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Send
          </button>
        </div>
        {isListening && (
          <p className="text-xs text-center text-indigo-600 mt-2">
            🎤 Recording... Speak your question. Click the mic again to stop.
          </p>
        )}
      </form>
    </div>
  )
}

export default Chatbot

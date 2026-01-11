/** @type {import('jest').Config} */
export default {
  // Use ES modules
  transform: {},
  
  // Test file patterns
  testMatch: ['**/tests/**/*.test.js'],
  
  // Module file extensions
  moduleFileExtensions: ['js', 'json'],
  
  // Verbose output
  verbose: true,
  
  // Test timeout (ms)
  testTimeout: 10000
};

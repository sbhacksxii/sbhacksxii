FROM node:18-alpine

WORKDIR /app

# Copy backend package files
COPY backend/package*.json ./backend/

# Install backend dependencies
WORKDIR /app/backend
# Using npm install instead of npm ci for flexibility during development
RUN npm install --production --omit=dev

# Copy backend application files
COPY backend/ ./

# Expose port
EXPOSE 3001

# Use PORT environment variable or default to 3001
ENV PORT=3001

# Start the application
CMD ["node", "server.js"]


FROM node:18-alpine

WORKDIR /app

# Copy backend package files
COPY backend/package*.json ./backend/

# Install backend dependencies
WORKDIR /app/backend
RUN npm ci --only=production

# Copy backend application files
COPY backend/ ./

# Expose port
EXPOSE 3001

# Use PORT environment variable or default to 3001
ENV PORT=3001

# Start the application
CMD ["node", "server.js"]


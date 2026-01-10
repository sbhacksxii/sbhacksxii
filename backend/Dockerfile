FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
# Using npm install instead of npm ci for flexibility during development
# npm ci requires exact lock file sync, which can be problematic during active development
RUN npm install --production --omit=dev

# Copy application files
COPY . .

# Expose port
EXPOSE 3001

# Start the application
CMD ["node", "server.js"]


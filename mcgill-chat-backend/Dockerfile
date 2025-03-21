FROM node:18-alpine

WORKDIR /app

# Copy package files first for better caching
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy application code
COPY . .

# Expose ports for HTTP and HTTPS
EXPOSE 5001 5002

# Command to run the server
CMD ["node", "server.js"]
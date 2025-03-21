FROM node:18-alpine

# Set working directory to root project folder
WORKDIR /app

# Copy the entire project
COPY . .

# Build frontend
WORKDIR /app/mcgill-chat-frontend
RUN npm install
RUN npm run build

# Set up backend
WORKDIR /app/mcgill-chat-backend
RUN npm install --only=production

# Expose ports for HTTP and HTTPS
EXPOSE 5001 5002

# Ensure the public directory exists
RUN mkdir -p public

# Start the backend server
CMD ["node", "server.js"]
FROM node:18-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm install --production

# Copy application files
COPY . .

# Create data directory
RUN mkdir -p /app/data

# Non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    chown -R nodejs:nodejs /app
USER nodejs

EXPOSE 3000

CMD ["node", "server.js"]

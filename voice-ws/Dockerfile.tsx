/*
# Cloud Run kör bäst på en slimmad Node 20
FROM node:20-alpine

WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

COPY . .
ENV PORT=8080
EXPOSE 8080
CMD ["npm", "start"]
*/
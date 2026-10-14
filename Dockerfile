# Dockerfile para ejecución local o en contenedores (Cloud Run / VPS)
# Nota: Firebase Hosting sirve directamente los archivos estáticos desde /public y no utiliza Docker.
FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

EXPOSE 3000

ENV NODE_ENV=production

CMD ["npm", "start"]

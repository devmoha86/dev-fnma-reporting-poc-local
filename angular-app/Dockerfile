FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --ignore-scripts --legacy-peer-deps

COPY . .

EXPOSE 4200

CMD ["sh", "-c", "if [ -n \"$API_URL\" ]; then sed -i -E \"s|apiUrl:[[:space:]]*'[^']*'|apiUrl: '$API_URL'|g\" src/environments/environment.ts; fi; npx ng serve --host 0.0.0.0 --port 4200"]

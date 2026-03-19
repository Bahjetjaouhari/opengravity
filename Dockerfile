FROM node:22-alpine

# Directorio de trabajo
WORKDIR /app

# Copiamos package.json
COPY package*.json ./

# Instalamos sólo las dependencias de producción
RUN npm install

# Copiamos el código transpilado o los scripts fuente
COPY . .

# Compilamos si es necesario (con esbuild o tsc, en este caso corremos con node directamente
# o seguimos usando tsx para simplificar, aunque lo propio es usar tsc)
# Aquí optamos por mantener tsx en prod para máxima compatibilidad con el código actual
RUN npm install -g tsx

# Exponemos un puerto por si el hoster lo pide para webhooks/health check, aunque usemos long-polling
EXPOSE 8080

# Comando para ejecutar el bot
CMD ["npm", "run", "start"]

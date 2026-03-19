# OpenGravity

Agente de IA personal hecho a medida. 
Funciona enteramente en tu máquina local y se conecta mediante Telegram *long-polling* (no requiere puertos abiertos/servidor web).

## Stack Principal
- TypeScript (ESModules)
- Grammy (Telegram Bot)
- OpenAI SDK (Usando Groq API como principal, Llama 3.3 70b)
- `node:sqlite` (Base de datos nativa en Node.js 22.5.0+ para la memoria a largo plazo)

## Cómo empezar

1. Entra a la carpeta del proyecto.
2. Instala dependencias si no lo has hecho:
   ```bash
   npm install
   ```
3. Ejecuta el entorno de desarrollo:
   ```bash
   npm run dev
   ```

## Características Incorporadas
- Limitado a la whitelist de Telegram (`TELEGRAM_ALLOWED_USER_IDS`).
- Base de datos en memoria y disco rápida (SQLite nativo) con `PRAGMA WAL`.
- Agent-loop protegido de iteraciones infinitas integrado.
- Estructura modular preparada para añadir herramientas fácilmente en la carpeta `src/tools/`.

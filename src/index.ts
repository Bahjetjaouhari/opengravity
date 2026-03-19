import { startBot } from './bot/telegram.js';
import http from 'node:http';

// Punto de entrada de la aplicación
const main = async () => {
  try {
    console.log('[Sistema] Iniciando OpenGravity...');
    
    // Iniciar servidor mínimo para Health Checks (obligatorio en plataformas como Koyeb, Render, Railway)
    const port = process.env.PORT || 8080;
    http.createServer((req, res) => {
      res.writeHead(200);
      res.end('Bot está corriendo 24/7 de forma saludable.');
    }).listen(port, () => {
      console.log(`[Sistema] Servidor HTTP de Health Check activo en el puerto ${port}`);
    });

    await startBot();
  } catch (error) {
    console.error('[Error Crítico]', error);
    process.exit(1);
  }
};

main();

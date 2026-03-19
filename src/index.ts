import { startBot } from './bot/telegram.js';
import http from 'node:http';
import { env } from './config/env.js';

// Punto de entrada de la aplicación para MODO LOCAL
const main = async () => {
  try {
    console.log('[Sistema] Iniciando OpenGravity en modo local...');
    
    // Iniciar servidor mínimo para Health Checks (obligatorio en plataformas de contenedores, ignorado en Vercel)
    const port = process.env.PORT || 8080;
    http.createServer((req, res) => {
      res.writeHead(200);
      res.end('Bot está corriendo localmente de forma saludable.');
    }).listen(port, () => {
      console.log(`[Sistema] Servidor HTTP de Health Check activo en el puerto ${port}`);
    });

    await startBot();
  } catch (error: any) {
    if (error.message && error.message.includes('webhook is active')) {
      console.log("\n==========================================");
      console.log("🛑 CONFLICTO DETECTADO");
      console.log("Actualmente tienes la nube (Vercel) conectada a tu bot usando Webhooks.");
      console.log("Telegram no permite que corras el bot en tu PC (long-polling) y en la nube al mismo tiempo.");
      console.log(`\nPara correr en local apaga primero la nube visitando en tu navegador:`);
      console.log(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/deleteWebhook`);
      console.log("==========================================\n");
    } else {
      console.error('[Error Crítico]', error);
    }
    process.exit(1);
  }
};

main();

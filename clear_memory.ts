import { memory } from './src/memory/db.js';
import { env } from './src/config/env.js';

const userId = env.TELEGRAM_ALLOWED_USER_IDS[0];

if (!userId) {
  console.error('No hay USER_ID configurado en TELEGRAM_ALLOWED_USER_IDS');
  process.exit(1);
}

console.log(`Limpiando historial para usuario ${userId}...`);

await memory.clearHistory(userId);

console.log('✅ Historial de conversación eliminado.');
process.exit(0);
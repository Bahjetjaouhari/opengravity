import { Bot } from 'grammy';
import { env } from './src/config/env.js';

async function setCommands() {
  const bot = new Bot(env.TELEGRAM_BOT_TOKEN!);
  await bot.api.setMyCommands([
    { command: 'start', description: 'Reiniciar bot / Ver ayuda' },
    { command: 'inventario', description: 'Ver todo el stock' },
    { command: 'propio', description: 'Ver solo stock propio' },
    { command: 'pedido', description: 'Ver catálogo por pedido' },
    { command: 'proveedores', description: 'Lista de proveedores' },
    { command: 'tipos', description: 'Ver categorías con stock' },
    { command: 'stats', description: 'Ver estadísticas de inventario' },
    { command: 'tienda', description: 'Ver link de tienda pública y QR' },
    { command: 'post', description: 'Generar texto para estado (Random)' }
  ]);
  console.log('✅ Comandos configurados en Telegram');
}

setCommands().catch(console.error);

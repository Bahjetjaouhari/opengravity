import { webhookCallback } from "grammy";
import { bot } from "../src/bot/telegram.js";

// Amplía el tiempo de ejecución a 60 segundos (lo máximo en Hobby Vercel)
// para que el LLM tenga margen de pensar y usar tools sin que se corte.
export const config = {
  maxDuration: 60,
};

// Vercel mapea automáticamente esto como una API function
export default webhookCallback(bot, "http");

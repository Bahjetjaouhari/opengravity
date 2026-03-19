import { Tool } from './index.js';

export const getCurrentTimeTool: Tool = {
  definition: {
    type: "function",
    function: {
      name: "get_current_time",
      description: "Obtiene la fecha y hora actual del sistema. Útil para responder preguntas sobre la hora actual, fecha o el día actual.",
      parameters: {
        type: "object",
        properties: {
          timezone: {
            type: "string",
            description: "Opcional. Zona horaria en formato IANA (ej. 'America/Madrid'). Si no se provee, se usará la zona horaria local del servidor.",
          }
        }
      }
    }
  },
  execute: ({ timezone }: { timezone?: string }) => {
    try {
      const now = new Date();
      if (timezone) {
        return now.toLocaleString('es-ES', { timeZone: timezone, dateStyle: 'full', timeStyle: 'long' });
      } else {
        return now.toLocaleString('es-ES', { dateStyle: 'full', timeStyle: 'long' });
      }
    } catch (e: any) {
      return `Error obteniendo la hora para timezone ${timezone}: ${e.message}`;
    }
  }
};

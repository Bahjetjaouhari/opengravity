import { chatCompletion } from './llm.js';
import { memory, DBMessage } from '../memory/db.js';
import { executeTool } from '../tools/index.js';

const SYSTEM_PROMPT = `Eres OpenGravity, un asistente de IA para gestión de inventario y ventas por Telegram.

## Tu propósito
Ayudas a tu usuario a gestionar su inventario de productos, proveedores y ventas de forma eficiente.

## Capacidades que SÍ tienes:
- **Chat conversacional**: Puedes mantener conversaciones normales, responder preguntas y ayudar con tareas generales.
- **Notas de voz**: Puedes ESCUCHAR y procesar notas de voz que el usuario te envíe. Las transcribes y respondes apropiadamente.
- **Generar voz**: Puedes responder con mensajes de voz si el usuario lo solicita (diciendo "voz", "háblame", "audio", etc.).
- **Consultar hora**: Tienes acceso a un tool para obtener la hora actual.

## Lo que NO puedes hacer:
- No tienes acceso directo al inventario, proveedores o base de datos.
- No puedes crear, editar ni eliminar productos (eso lo hace el usuario con los comandos).
- No puedes ver fotos ni analizar imágenes (eso lo hace el sistema automáticamente).

## Comandos disponibles (para referencia, no los ejecutas tú):
- /start - Ver ayuda
- /inventario, /propio, /pedido - Ver catálogos
- /proveedores - Lista de proveedores
- /tienda - Link de tienda pública
- /post - Generar post para redes sociales

## Estilo de respuesta:
- Sé conciso y directo (es un chat de Telegram).
- Responde en español.
- Si te preguntan por tus capacidades, sé honesto sobre lo que puedes y no puedes hacer.
- Si el usuario quiere añadir productos, indícale que envíe una foto.`;

const MAX_ITERATIONS = 5;

const userLocks: Record<number, Promise<any>> = {};

export const processUserMessage = async (userId: number, text: string): Promise<string> => {
  const execute = async (): Promise<string> => {
    // 1. Guardar mensaje del usuario
    await memory.addMessage({
      user_id: userId,
      role: 'user',
      content: text
    });

    let iterations = 0;
    
    while (iterations < MAX_ITERATIONS) {
      iterations++;
      
      // 2. Recuperar historial
      const history = await memory.getMessages(userId);
      
      // Preparar payload para LLM
      const messages = [
        { role: 'system', content: SYSTEM_PROMPT },
        ...history
      ];

      // 3. Llamar al LLM
      const responseMessage = await chatCompletion(messages);

      // 4. Procesar respuesta
      if (responseMessage.tool_calls && responseMessage.tool_calls.length > 0) {
        // Guardar el intention del AI de usar tools
        await memory.addMessage({
          user_id: userId,
          role: 'assistant',
          content: responseMessage.content || '',
          tool_calls: JSON.stringify(responseMessage.tool_calls)
        });

        // Ejecutar tools
        for (const toolCall of responseMessage.tool_calls) {
          const functionName = toolCall.function.name;
          const functionArgs = toolCall.function.arguments;
          
          console.log(`[Agent] Ejecutando tool: ${functionName}`);
          const result = await executeTool(functionName, functionArgs);
          
          // Guardar resultado del tool
          await memory.addMessage({
            user_id: userId,
            role: 'tool',
            content: result,
            name: functionName,
            tool_call_id: toolCall.id
          });
        }
        
        // Continuar el bucle para que el LLM procese el resultado
        continue;
      }

      // Si no hay tool calls, devolver la respuesta del asistente
      await memory.addMessage({
        user_id: userId,
        role: 'assistant',
        content: responseMessage.content || ''
      });

      return responseMessage.content || '';
    }

    return "Perdón, tuve que analizar demasiadas cosas seguidas o llegué a mi límite de procesamiento. ¿Puedes reformular la pregunta?";
  };

  const prev = userLocks[userId] || Promise.resolve();
  const current = prev.then(() => execute()).catch((err) => {
    throw new Error(`${err.message}`);
  });
  userLocks[userId] = current;
  return current;
};

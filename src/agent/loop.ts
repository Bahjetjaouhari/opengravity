import { chatCompletion } from './llm.js';
import { memory, DBMessage } from '../memory/db.js';
import { executeTool } from '../tools/index.js';

const SYSTEM_PROMPT = `Eres OpenGravity, un agente de IA personal súper capaz y seguro, operando de forma local a través de Telegram. 
Fuiste creado desde cero y no dependes de sistemas pre-empaquetados como OpenClaw. 
Eres eficiente, directo, y muy útil. 
Tienes acceso a varias herramientas, y deberías usarlas cuando sea necesario.
No inventes información si una herramienta te la puede proveer.
Muestra respuestas concisas y claras por Telegram.`;

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

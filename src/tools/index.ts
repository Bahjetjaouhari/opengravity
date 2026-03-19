export interface Tool {
  definition: {
    type: "function";
    function: {
      name: string;
      description: string;
      parameters: {
        type: "object";
        properties: Record<string, any>;
        required?: string[];
      };
    };
  };
  execute: (args: any) => Promise<string> | string;
}

import { getCurrentTimeTool } from './get_current_time.js';

// Registrar aquí todas las herramientas
export const tools: Record<string, Tool> = {
  get_current_time: getCurrentTimeTool,
};

export const getAvailableToolsDefinitions = () => {
  return Object.values(tools).map((t) => t.definition);
};

export const executeTool = async (name: string, argsStr: string): Promise<string> => {
  const tool = tools[name];
  if (!tool) {
    return `Error: Herramienta desconocida -> ${name}`;
  }

  try {
    const args = JSON.parse(argsStr);
    const result = await tool.execute(args);
    return typeof result === 'string' ? result : JSON.stringify(result);
  } catch (err: any) {
    return `Error ejecutando ${name}: ${err.message}`;
  }
};

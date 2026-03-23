---
name: project_architecture
description: Arquitectura del bot de Telegram OpenGravity para gestión de inventario
type: project
---

## Stack Tecnológico
- **Runtime**: Node.js 22+ con TypeScript (ESModules)
- **Bot Framework**: Grammy para Telegram
- **Base de datos**: Firebase Firestore (persistencia serverless)
- **Hosting**: Vercel (serverless functions)
- **IA Vision**: OpenRouter API (modelos gratuitos como Gemini Flash)

## Estructura del Proyecto
```
Opengravity/
├── api/                    # Serverless functions (Vercel)
│   ├── webhook.ts         # Webhook de Telegram
│   ├── tienda.ts          # Tienda pública HTML (con lightbox y galería)
│   ├── photos.ts          # Proxy de fotos de Telegram
│   └── cron.ts            # Tareas programadas
├── src/
│   ├── bot/telegram.ts    # Lógica principal del bot
│   ├── inventory/
│   │   ├── db.ts          # CRUD Firestore productos (con soporte multi-foto)
│   │   ├── sessions.ts    # Sesiones de usuario (Firestore)
│   │   └── vision.ts     # Análisis de IA para fotos
│   ├── config/env.ts      # Variables de entorno
│   └── index.ts           # Punto de entrada local
└── vercel.json            # Configuración de despliegue
```

## Modelo de Datos (Producto) - ACTUALIZADO
```typescript
interface FotoProducto {
  file_id: string;
  url: string;
  orden: number;       // Para ordenar en galería (0 = principal)
  principal: boolean; // Foto de portada
}

interface Producto {
  id?: string;
  proveedor: string;
  tipos: string[];
  nombre: string;
  precio?: string;
  precios?: Record<string, string>;
  precio_total?: string;
  fotos?: FotoProducto[];    // ✅ NUEVO: Array de fotos
  foto_url?: string;        // Legacy (compatibilidad)
  foto_file_id?: string;    // Legacy (compatibilidad)
  disponible: boolean;
  modalidad: 'propio' | 'pedido';
  fecha_carga: string;
}
```

## Helpers Principales (db.ts)
- `getFotoPrincipal(producto)`: Obtiene la foto principal o la primera
- `getTodasLasFotos(producto)`: Obtiene todas las fotos ordenadas
- `agregarFotos(productoId, nuevasFotos)`: Agrega fotos a un producto existente
- `normalizarProducto(data)`: Convierte productos legacy al nuevo formato

## Flujo de Captura de Fotos
1. Usuario envía foto → Bot detecta `message:photo`
2. Se obtiene `file_id` de la foto más grande
3. IA Vision analiza y detecta tipos de artículos
4. Flujo interactivo pregunta: tipo, proveedor, precio, modalidad
5. Se guarda UN producto con una o más fotos en el array `fotos`

## Cambios Realizados (2026-03-23)
- **Múltiples fotos**: Soporte para galería de fotos por producto
- **Tienda**: Lightbox con navegación por flechas/teclado
- **WhatsApp**: Botón con fallback cuando no está configurado
- **Vercel**: Rewrites añadidos para `/tienda` → `/api/tienda`

## Variables de Entorno Requeridas
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_ALLOWED_USER_IDS`
- `FIREBASE_API_KEY`, `FIREBASE_PROJECT_ID`, etc.
- `OPENROUTER_API_KEY` (para IA Vision)
- `WHATSAPP_NUMBER` (opcional, para botón de contacto)
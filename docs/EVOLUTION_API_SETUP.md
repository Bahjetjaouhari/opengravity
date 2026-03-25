# Guía de Configuración: Evolution API para WhatsApp Status

Esta guía explica cómo configurar Evolution API en Render para enviar mensajes automáticos a WhatsApp.

## ¿Qué es Evolution API?

Evolution API es una API de código abierto que permite enviar mensajes de WhatsApp usando tu cuenta personal. Funciona como puente entre tu aplicación y WhatsApp Web.

## Requisitos

1. Una cuenta en [Render.com](https://render.com)
2. Un número de WhatsApp personal (el que recibirás los mensajes)
3. El código de este proyecto desplegado en Vercel

## Paso 1: Crear cuenta en Render

1. Ve a [Render.com](https://render.com) y regístrate
2. El plan gratuito es suficiente para empezar

## Paso 2: Desplegar Evolution API

### Opción A: Usar Docker en Render (Recomendado)

1. En Render, ve a **New > Web Service**
2. Selecciona **Deploy an existing image from a registry**
3. Usa la imagen: `atendai/evolution-api:latest`
4. Configura:
   - **Name**: `evolution-api`
   - **Region**: Oregon (US West) o el más cercano
   - **Instance Type**: Free (o Starter para mejor rendimiento)
   - **Environment Variables**:
     ```
     SERVER_URL=https://tu-evolution-api.onrender.com
     SERVER_PORT=8080
     CORS_ORIGIN=*
     DATABASE_ENABLED=true
     DATABASE_CONNECTION=sqlite
     DATABASE_CLIENT=sqlite
     ```
5. Crea el servicio y espera a que esté listo (5-10 minutos)

### Opción B: Railway (Alternativa)

1. Ve a [Railway.app](https://railway.app) y regístrate
2. Crea un nuevo proyecto
3. Añade un servicio con la imagen Docker `atendai/evolution-api:latest`
4. Configura las mismas variables de entorno

## Paso 3: Crear una instancia de WhatsApp

Una vez que Evolution API esté corriendo:

1. Abre Postman o usa curl para crear una instancia:

```bash
curl -X POST https://tu-evolution-api.onrender.com/instance/create \
  -H "Content-Type: application/json" \
  -d '{
    "instanceName": "bjprestige",
    "qrcode": true,
    "integration": "WHATSAPP-BAILEYS"
  }'
```

2. La respuesta incluirá un QR code
3. Abre WhatsApp en tu teléfono > Menú > Dispositivos vinculados > Vincular dispositivo
4. Escanea el QR code
5. Tu WhatsApp ahora está conectado a Evolution API

## Paso 4: Obtener la API Key

1. Ve a la configuración de tu instancia en Evolution API
2. Copia la **API Key** generada

## Paso 5: Configurar variables de entorno

Añade estas variables a tu proyecto en Vercel:

```env
EVOLUTION_API_URL=https://tu-evolution-api.onrender.com
EVOLUTION_API_KEY=tu-api-key-aqui
EVOLUTION_INSTANCE=bjprestige
```

## Paso 6: Verificar conexión

Para probar que todo funciona:

```bash
curl -X GET https://tu-evolution-api.onrender.com/instance/fetchInstances \
  -H "apikey: tu-api-key"
```

Deberías ver tu instancia como "connected".

## Notas importantes

### Plan gratuito de Render

El plan gratuito de Render tiene limitaciones:
- El servicio se "duerme" después de 15 minutos de inactividad
- El primer request después de dormir puede tardar 30-60 segundos
- Esto puede causar que los mensajes automáticos fallen ocasionalmente

**Solución**: Usa un servicio como [UptimeRobot](https://uptimerobot.com) para hacer ping a tu Evolution API cada 10 minutos.

### Seguridad

- Nunca compartas tu API Key públicamente
- Usa siempre HTTPS
- La variable CRON_SECRET protege los endpoints de cron

### Límites de WhatsApp

- WhatsApp puede bloquear cuentas que envíen demasiados mensajes automatizados
- Mantén los mensajes naturales y no muy frecuentes
- El sistema actual envía máximo 3 mensajes por día (2 WhatsApp Status + 1 Telegram)

## Troubleshooting

### QR Code no aparece

1. Verifica que la instancia esté corriendo
2. Reinicia la instancia desde el panel de Render
3. Borra la instancia y crea una nueva

### Mensajes no se envían

1. Verifica que la instancia esté "connected"
2. Revisa los logs en Render
3. Verifica que las variables de entorno estén correctas

### WhatsApp se desconecta

1. WhatsApp Web tiene un límite de tiempo de conexión
2. Necesitas reconectar escaneando el QR cada cierto tiempo
3. Evolution API maneja esto automáticamente en la mayoría de casos

## Recursos

- [Documentación de Evolution API](https://doc.evolution-api.com/)
- [Repositorio GitHub](https://github.com/EvolutionAPI/evolution-api)
- [Render Docs](https://render.com/docs)
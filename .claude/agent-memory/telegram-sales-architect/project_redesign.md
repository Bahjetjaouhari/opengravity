---
name: project_redesign
description: Rediseño de la tienda OpenGravity a BJ Prestige con nueva identidad visual
type: project
---

## Rediseño BJ Prestige (2026-03-23)

La tienda fue completamente rediseñada bajo la marca "BJ Prestige" con los siguientes cambios:

**Nueva Identidad Visual:**
- Marca: BJ Prestige (anteriormente OpenGravity)
- Paleta de colores: Dorado (#D4AF37), Negro (#0A0A0A), Carbon (#1A1A1A), Plata (#C0C0C0)
- Tipografia: Playfair Display (titulos) + Inter (cuerpo)
- Patron sutil de leopard spots en el fondo
- Estilo: Leopard-chic con Glassmorphism en tarjetas

**Archivos Modificados:**
- `api/tienda.ts` - Tienda completa rediseñada
- `api/producto-preview.ts` - Preview de WhatsApp actualizado
- `public/logo-main.jpg` - Logo principal
- `public/logo-wide.jpg` - Logo horizontal
- `public/store-reference.png` - Imagen de referencia del diseño

**Nuevas Funcionalidades:**
- Carrito lateral interactivo con vista previa
- Boton "Agregar al carrito" con animacion de confirmacion
- Flujo de WhatsApp mejorado: consulta multiple de productos
- Filtrado por categorias con chips animados
- Soporte Dark/Light mode automatico
- Badges "Nuevo" y "Best Seller" en productos
- Navegacion por teclado en lightbox

**Como aplicar:**
Al hacer cambios en la tienda, mantener la paleta de colores BJ Prestige y el estilo Glassmorphism. Los componentes principales estan en el CSS dentro de `buildHTML()` en tienda.ts.
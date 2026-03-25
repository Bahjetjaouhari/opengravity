/**
 * Tracking de productos enviados
 * Evita repetición de productos en los últimos 7 días
 */

import { getFirestore, collection, addDoc, query, where, getDocs, orderBy, limit } from 'firebase/firestore';

// Tipo de envío
export type TipoEnvio = 'whatsapp_status' | 'telegram_marketing';

// Interface para registro de producto enviado
export interface ProductoEnviado {
  id?: string;
  producto_id: string;
  tipo_envio: TipoEnvio;
  fecha_envio: string; // ISO timestamp
  mensaje: string;
  tipos_producto: string[]; // Para referencia rápida
}

// Días para evitar repetición
const DIAS_SIN_REPETIR = 7;

/**
 * Registra un producto como enviado
 */
export async function registrarProductoEnviado(
  productoId: string,
  tipoEnvio: TipoEnvio,
  mensaje: string,
  tiposProducto: string[]
): Promise<string> {
  const db = getFirestore();

  const registro: ProductoEnviado = {
    producto_id: productoId,
    tipo_envio: tipoEnvio,
    fecha_envio: new Date().toISOString(),
    mensaje: mensaje,
    tipos_producto: tiposProducto
  };

  const docRef = await addDoc(collection(db, 'productos_enviados'), registro);
  return docRef.id;
}

/**
 * Obtiene los IDs de productos enviados en los últimos N días
 * @param dias Número de días hacia atrás (default: 7)
 * @param tipoEnvio Filtrar por tipo de envío (opcional)
 */
export async function obtenerProductosEnviados(
  dias: number = DIAS_SIN_REPETIR,
  tipoEnvio?: TipoEnvio
): Promise<string[]> {
  const db = getFirestore();

  // Calcular fecha límite
  const fechaLimite = new Date();
  fechaLimite.setDate(fechaLimite.getDate() - dias);

  // Construir query
  let q = query(
    collection(db, 'productos_enviados'),
    where('fecha_envio', '>=', fechaLimite.toISOString()),
    orderBy('fecha_envio', 'desc')
  );

  if (tipoEnvio) {
    q = query(q, where('tipo_envio', '==', tipoEnvio));
  }

  const snapshot = await getDocs(q);

  // Extraer IDs únicos de productos
  const ids = snapshot.docs.map(doc => doc.data().producto_id as string);
  return [...new Set(ids)]; // Eliminar duplicados
}

/**
 * Obtiene los registros completos de productos enviados
 * @param dias Número de días hacia atrás
 * @param tipoEnvio Filtrar por tipo de envío (opcional)
 */
export async function obtenerHistorialEnvios(
  dias: number = DIAS_SIN_REPETIR,
  tipoEnvio?: TipoEnvio
): Promise<ProductoEnviado[]> {
  const db = getFirestore();

  const fechaLimite = new Date();
  fechaLimite.setDate(fechaLimite.getDate() - dias);

  let q = query(
    collection(db, 'productos_enviados'),
    where('fecha_envio', '>=', fechaLimite.toISOString()),
    orderBy('fecha_envio', 'desc'),
    limit(50) // Limitar a últimos 50 registros
  );

  if (tipoEnvio) {
    q = query(q, where('tipo_envio', '==', tipoEnvio));
  }

  const snapshot = await getDocs(q);

  return snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  } as ProductoEnviado));
}

/**
 * Verifica si un producto fue enviado recientemente
 */
export async function fueEnviadoRecientemente(
  productoId: string,
  dias: number = DIAS_SIN_REPETIR
): Promise<boolean> {
  const enviados = await obtenerProductosEnviados(dias);
  return enviados.includes(productoId);
}

/**
 * Filtra una lista de productos excluyendo los enviados recientemente
 */
export async function filtrarProductosDisponibles<T extends { id?: string }>(
  productos: T[],
  dias: number = DIAS_SIN_REPETIR
): Promise<T[]> {
  const enviados = await obtenerProductosEnviados(dias);
  return productos.filter(p => p.id && !enviados.includes(p.id));
}
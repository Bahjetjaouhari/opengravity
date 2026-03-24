import { initializeApp, getApps } from 'firebase/app';
import {
  getFirestore, collection, addDoc, getDocs, deleteDoc,
  query, where, doc, updateDoc
} from 'firebase/firestore';
import { env } from '../config/env.js';

const app = getApps().length ? getApps()[0] : initializeApp({
  apiKey: env.FIREBASE_API_KEY,
  authDomain: env.FIREBASE_AUTH_DOMAIN,
  projectId: env.FIREBASE_PROJECT_ID,
  storageBucket: env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.FIREBASE_MESSAGING_SENDER_ID,
  appId: env.FIREBASE_APP_ID
});

const db = getFirestore(app);

export type Modalidad = 'propio' | 'pedido';

export interface FotoProducto {
  file_id: string;
  url: string;
  orden: number;       // Para ordenar en galería (0 = principal)
  principal: boolean;  // Foto de portada
}

export interface Producto {
  id?: string;
  proveedor: string;
  tipos: string[];
  nombre: string;
  // Precio de venta único
  precio?: string;
  // Precio de costo (para cálculo de ganancias)
  precio_costo?: string;
  // Precios individuales por tipo: { gorra: "$20", franela: "$50" }
  precios?: Record<string, string>;
  // Total calculado automáticamente si se pusieron precios individuales
  precio_total?: string;
  // Soporte para múltiples fotos (array, la primera es la principal)
  fotos?: FotoProducto[];
  // Campos legacy para compatibilidad hacia atrás
  foto_url?: string;
  foto_file_id?: string;
  disponible: boolean;
  modalidad: Modalidad;
  fecha_carga: string;
}

// Normaliza el texto de un tipo para evitar duplicados por acentos/mayúsculas
const normalizarTipo = (t: string) => t.toLowerCase().trim()
  .normalize('NFD').replace(/[\u0300-\u036f]/g, ''); // elimina acentos

/**
 * Normaliza un producto legacy (foto_url/foto_file_id) al nuevo formato con array fotos.
 * Mantiene compatibilidad hacia atrás con productos existentes.
 */
function normalizarProducto(data: any): Producto {
  const producto = { ...data } as Producto;

  // Si el producto tiene el formato legacy (foto_url/foto_file_id pero no fotos)
  if (!producto.fotos || producto.fotos.length === 0) {
    if (data.foto_file_id && data.foto_url) {
      producto.fotos = [{
        file_id: data.foto_file_id,
        url: data.foto_url,
        orden: 0,
        principal: true
      }];
    } else {
      producto.fotos = [];
    }
  }

  return producto;
}

export const inventarioDB = {

  /**
   * Helper: devuelve el precio más relevante para mostrar.
   * Si hay precios individuales y se filtró por tipo, muestra el precio de ese tipo.
   * Sino muestra precio_total o precio.
   */
  getPrecioParaTipo: (producto: Producto, tipo?: string): string => {
    if (tipo && producto.precios?.[tipo.toLowerCase().trim()]) {
      return producto.precios[tipo.toLowerCase().trim()];
    }
    return producto.precio_total || producto.precio || 'Sin precio';
  },

  /**
   * Helper: obtiene la foto principal de un producto.
   * Si tiene array fotos, retorna la marcada como principal o la primera.
   * Fallback a formato legacy.
   */
  getFotoPrincipal: (producto: Producto): FotoProducto | null => {
    if (producto.fotos && producto.fotos.length > 0) {
      const principal = producto.fotos.find(f => f.principal);
      return principal || producto.fotos[0];
    }
    // Fallback legacy
    if (producto.foto_file_id && producto.foto_url) {
      return {
        file_id: producto.foto_file_id,
        url: producto.foto_url,
        orden: 0,
        principal: true
      };
    }
    return null;
  },

  /**
   * Helper: obtiene todas las fotos de un producto en orden.
   */
  getTodasLasFotos: (producto: Producto): FotoProducto[] => {
    if (producto.fotos && producto.fotos.length > 0) {
      return [...producto.fotos].sort((a, b) => a.orden - b.orden);
    }
    // Fallback legacy
    if (producto.foto_file_id && producto.foto_url) {
      return [{
        file_id: producto.foto_file_id,
        url: producto.foto_url,
        orden: 0,
        principal: true
      }];
    }
    return [];
  },

  agregar: async (producto: Omit<Producto, 'id'>): Promise<string> => {
    // Serializar y deserializar es el truco perfecto de TS para eliminar recursivamente todo lo que sea "undefined" o inválido.
    const cleanProducto = JSON.parse(JSON.stringify(producto));

    const docRef = await addDoc(collection(db, 'inventario'), {
      ...cleanProducto,
      tipos: producto.tipos.map(normalizarTipo),
      disponible: true,
      fecha_carga: new Date().toISOString()
    });
    return docRef.id;
  },

  /**
   * Agrega fotos adicionales a un producto existente.
   */
  agregarFotos: async (productoId: string, nuevasFotos: FotoProducto[]): Promise<void> => {
    const productoRef = doc(db, 'inventario', productoId);
    const producto = await getDocs(query(collection(db, 'inventario'), where('__name__', '==', productoId)));

    if (producto.empty) throw new Error('Producto no encontrado');

    const data = producto.docs[0].data() as Producto;
    const fotosActuales = data.fotos || [];

    // Asignar orden a las nuevas fotos
    const ordenMaximo = fotosActuales.length > 0
      ? Math.max(...fotosActuales.map(f => f.orden))
      : -1;

    const fotosConOrden = nuevasFotos.map((f, i) => ({
      ...f,
      orden: ordenMaximo + 1 + i,
      principal: false // Las fotos adicionales nunca son principales
    }));

    await updateDoc(productoRef, {
      fotos: [...fotosActuales, ...fotosConOrden]
    });
  },

  /**
   * Obtiene productos disponibles.
   * - Si se filtra por tipo, devuelve CUALQUIER foto que contenga ese tipo (mixtas incluidas)
   * - Si se filtra por proveedor, filtra por nombre exacto (parcial)
   * - Si se filtra por modalidad, filtra por 'propio' o 'pedido'
   */
  obtener: async (filtros?: {
    proveedor?: string;
    tipo?: string;
    modalidad?: Modalidad;
  }): Promise<Producto[]> => {
    const snapshot = await getDocs(
      query(collection(db, 'inventario'), where('disponible', '==', true))
    );

    let productos: Producto[] = snapshot.docs.map(d => normalizarProducto({ id: d.id, ...d.data() }));

    if (filtros?.proveedor) {
      const prov = normalizarTipo(filtros.proveedor);
      productos = productos.filter(p =>
        normalizarTipo(p.proveedor).includes(prov)
      );
    }

    if (filtros?.tipo) {
      const tipo = normalizarTipo(filtros.tipo);
      // ✅ Una foto aparece en el catálogo de franelas SI tiene "franela" ENTRE sus tipos
      productos = productos.filter(p =>
        p.tipos.some(t => normalizarTipo(t).includes(tipo))
      );
    }

    if (filtros?.modalidad) {
      productos = productos.filter(p => p.modalidad === filtros.modalidad);
    }

    return productos;
  },

  /**
   * Busca un producto por file_id (busca en el array fotos y en el campo legacy).
   */
  obtenerPorFileId: async (fileId: string): Promise<Producto | null> => {
    // Buscar en formato nuevo (array fotos)
    const snapshot = await getDocs(collection(db, 'inventario'));
    const docs = snapshot.docs;

    for (const d of docs) {
      const data = d.data();
      const producto = normalizarProducto({ id: d.id, ...data });

      // Buscar en el array de fotos
      if (producto.fotos && producto.fotos.some(f => f.file_id === fileId)) {
        return producto;
      }

      // Buscar en campo legacy
      if (data.foto_file_id === fileId) {
        return producto;
      }
    }

    return null;
  },

  eliminar: async (id: string): Promise<void> => {
    await updateDoc(doc(db, 'inventario', id), { disponible: false });
  },

  listarProveedores: async (): Promise<string[]> => {
    const productos = await inventarioDB.obtener();
    return [...new Set(productos.map(p => p.proveedor))].sort();
  },

  // ✅ Lista TODOS los tipos únicos (expandiendo los arrays de cada producto)
  listarTipos: async (): Promise<string[]> => {
    const productos = await inventarioDB.obtener();
    const todosLosTipos = productos.flatMap(p => p.tipos);
    return [...new Set(todosLosTipos)].sort();
  },

  /**
   * Actualiza campos específicos de un producto.
   * Los campos con valor null se eliminan del documento.
   */
  actualizar: async (id: string, campos: Partial<Producto>): Promise<void> => {
    const productoRef = doc(db, 'inventario', id);

    // Filtrar valores undefined y convertir null a deleteField
    const { deleteField } = await import('firebase/firestore');
    const camposLimpios: Record<string, any> = {};

    for (const [key, value] of Object.entries(campos)) {
      if (value === undefined) continue; // Ignorar undefined
      if (value === null) {
        camposLimpios[key] = deleteField(); // Eliminar campo
      } else {
        camposLimpios[key] = value;
      }
    }

    await updateDoc(productoRef, camposLimpios);
  },

  obtenerAleatorio: async (filtros?: { modalidad?: Modalidad }): Promise<Producto | null> => {
    const productos = await inventarioDB.obtener(filtros);
    if (productos.length === 0) return null;
    return productos[Math.floor(Math.random() * productos.length)];
  }
};

export interface Proveedor {
  id?: string;
  nombre: string;
  contacto?: string; // WhatsApp, Instagram, Telegram, etc.
}

export const proveedoresDB = {
  obtenerPorNombre: async (nombre: string): Promise<Proveedor | null> => {
    const norm = normalizarTipo(nombre);
    const q = query(collection(db, 'proveedores'), where('nombre_normalizado', '==', norm));
    const snap = await getDocs(q);
    if (snap.empty) return null;
    return { id: snap.docs[0].id, ...snap.docs[0].data() } as Proveedor;
  },

  agregar: async (proveedor: Omit<Proveedor, 'id'>): Promise<string> => {
    const norm = normalizarTipo(proveedor.nombre);
    const docRef = await addDoc(collection(db, 'proveedores'), {
      ...proveedor,
      nombre_normalizado: norm,
      fecha_registro: new Date().toISOString()
    });
    return docRef.id;
  }
};

export const adminDB = {
  vaciarBaseDeDatos: async (): Promise<void> => {
    const collections = ['inventario', 'proveedores', 'sesiones'];
    for (const collName of collections) {
      const q = collection(db, collName);
      const snap = await getDocs(q);
      const promises = snap.docs.map(d => deleteDoc(doc(db, collName, d.id)));
      await Promise.all(promises);
    }
  }
};

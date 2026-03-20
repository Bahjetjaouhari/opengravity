import { initializeApp, getApps } from 'firebase/app';
import {
  getFirestore, collection, addDoc, getDocs, deleteDoc,
  query, where, doc, updateDoc
} from 'firebase/firestore';
import { env } from '../config/env.js';

// Reutilizamos la app de Firebase si ya existe
const app = getApps().length ? getApps()[0] : initializeApp({
  apiKey: env.FIREBASE_API_KEY,
  authDomain: env.FIREBASE_AUTH_DOMAIN,
  projectId: env.FIREBASE_PROJECT_ID,
  storageBucket: env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.FIREBASE_MESSAGING_SENDER_ID,
  appId: env.FIREBASE_APP_ID
});

const db = getFirestore(app);

export interface Producto {
  id?: string;
  proveedor: string;             // Nombre del proveedor
  tipo: string;                  // Categoría: franelas, pantalones, zapatos, etc.
  nombre: string;                // Descripción del producto
  precio?: string;               // Precio en texto libre: "$15", "15.000 Bs", etc.
  foto_url: string;              // URL pública de la foto en Telegram (file_id funciona localmente)
  foto_file_id: string;          // file_id de Telegram para reenviar la foto sin descargarla
  disponible: boolean;           // true = en stock, false = agotado
  fecha_carga: string;           // ISO timestamp
}

export const inventarioDB = {

  // Guarda un producto nuevo
  agregar: async (producto: Omit<Producto, 'id'>): Promise<string> => {
    const docRef = await addDoc(collection(db, 'inventario'), {
      ...producto,
      disponible: true,
      fecha_carga: new Date().toISOString()
    });
    return docRef.id;
  },

  // Obtiene todos los productos disponibles (opcional: filtrar por campo)
  obtener: async (filtros?: { proveedor?: string; tipo?: string }): Promise<Producto[]> => {
    let q = query(collection(db, 'inventario'), where('disponible', '==', true));

    const snapshot = await getDocs(q);
    let productos: Producto[] = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Producto));

    // Filtros en memoria para no requerir índices compuestos en Firebase
    if (filtros?.proveedor) {
      const prov = filtros.proveedor.toLowerCase().trim();
      productos = productos.filter(p => p.proveedor.toLowerCase().includes(prov));
    }
    if (filtros?.tipo) {
      const tipo = filtros.tipo.toLowerCase().trim();
      productos = productos.filter(p => p.tipo.toLowerCase().includes(tipo));
    }

    return productos;
  },

  // Obtiene un producto por su file_id de Telegram (útil para identificar foto al borrar)
  obtenerPorFileId: async (fileId: string): Promise<Producto | null> => {
    const q = query(collection(db, 'inventario'), where('foto_file_id', '==', fileId));
    const snap = await getDocs(q);
    if (snap.empty) return null;
    const d = snap.docs[0];
    return { id: d.id, ...d.data() } as Producto;
  },

  // Marca un producto como no disponible (no lo elimina físicamente)
  eliminar: async (id: string): Promise<void> => {
    await updateDoc(doc(db, 'inventario', id), { disponible: false });
  },

  // Lista todos los proveedores únicos con stock
  listarProveedores: async (): Promise<string[]> => {
    const productos = await inventarioDB.obtener();
    const set = new Set(productos.map(p => p.proveedor));
    return Array.from(set).sort();
  },

  // Lista todas las categorías únicas con stock
  listarTipos: async (): Promise<string[]> => {
    const productos = await inventarioDB.obtener();
    const set = new Set(productos.map(p => p.tipo));
    return Array.from(set).sort();
  },

  // Obtiene un producto aleatorio para el recordatorio diario
  obtenerAleatorio: async (): Promise<Producto | null> => {
    const productos = await inventarioDB.obtener();
    if (productos.length === 0) return null;
    return productos[Math.floor(Math.random() * productos.length)];
  }
};

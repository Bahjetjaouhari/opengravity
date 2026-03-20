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

export interface Producto {
  id?: string;
  proveedor: string;
  // ✅ Array de tipos para fotos mixtas: ["franela", "gorra"], ["zapato", "pantalon", "franela"]
  tipos: string[];
  nombre: string;
  precio?: string;
  foto_url: string;
  foto_file_id: string;
  disponible: boolean;
  // ✅ 'propio' = stock físico tuyo | 'pedido' = catálogo del proveedor, por encargo
  modalidad: Modalidad;
  fecha_carga: string;
}

// Normaliza el texto de un tipo para evitar duplicados por acentos/mayúsculas
const normalizarTipo = (t: string) => t.toLowerCase().trim()
  .normalize('NFD').replace(/[\u0300-\u036f]/g, ''); // elimina acentos

export const inventarioDB = {

  agregar: async (producto: Omit<Producto, 'id'>): Promise<string> => {
    const docRef = await addDoc(collection(db, 'inventario'), {
      ...producto,
      tipos: producto.tipos.map(normalizarTipo),
      disponible: true,
      fecha_carga: new Date().toISOString()
    });
    return docRef.id;
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

    let productos: Producto[] = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Producto));

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

  obtenerPorFileId: async (fileId: string): Promise<Producto | null> => {
    const q = query(collection(db, 'inventario'), where('foto_file_id', '==', fileId));
    const snap = await getDocs(q);
    if (snap.empty) return null;
    const d = snap.docs[0];
    return { id: d.id, ...d.data() } as Producto;
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

  obtenerAleatorio: async (filtros?: { modalidad?: Modalidad }): Promise<Producto | null> => {
    const productos = await inventarioDB.obtener(filtros);
    if (productos.length === 0) return null;
    return productos[Math.floor(Math.random() * productos.length)];
  }
};

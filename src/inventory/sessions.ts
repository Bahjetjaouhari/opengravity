import { initializeApp, getApps } from 'firebase/app';
import { getFirestore, doc, setDoc, getDoc, deleteDoc } from 'firebase/firestore';
import { env } from '../config/env.js';
import { Modalidad } from './db.js';

// Asegurar que Firebase está inicializado
const app = getApps().length ? getApps()[0] : initializeApp({
  apiKey: env.FIREBASE_API_KEY,
  authDomain: env.FIREBASE_AUTH_DOMAIN,
  projectId: env.FIREBASE_PROJECT_ID,
  storageBucket: env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.FIREBASE_MESSAGING_SENDER_ID,
  appId: env.FIREBASE_APP_ID
});
const db = getFirestore(app);

export interface PhotoSession {
  fileId: string;
  fileUrl: string;
  analisis?: { tipos: string[]; descripcion: string; confianza: string };
  tiposManual?: string[];
  proveedor?: string;
  precio?: string;
  precios?: Record<string, string>;
  precio_total?: string;
  modalidad?: Modalidad;
  esperandoCampo?: 'tipo' | 'proveedor' | 'proveedor_nuevo_confirmar' | 'proveedor_contacto' | 'precio' | 'modalidad' | 'confirmar';
  updatedAt: number;
}

const EXPIRY_MS = 15 * 60 * 1000; // Sesión expira en 15 minutos de inactividad

export const sessionsDB = {
  /**
   * Obtiene la sesión activa de un usuario.
   * Retorna null si no existe o si expiró (>15 mins sin actividad).
   */
  get: async (userId: number): Promise<PhotoSession | null> => {
    try {
      const snap = await getDoc(doc(db, 'sessions', String(userId)));
      if (!snap.exists()) return null;

      const data = snap.data() as PhotoSession;
      if (Date.now() - data.updatedAt > EXPIRY_MS) {
        await deleteDoc(doc(db, 'sessions', String(userId)));
        return null;
      }
      return data;
    } catch {
      return null;
    }
  },

  /**
   * Guarda o actualiza la sesión de un usuario en Firestore.
   * Persiste entre invocaciones serverless — es el estado "entre mensajes".
   */
  set: async (userId: number, session: Omit<PhotoSession, 'updatedAt'>): Promise<void> => {
    await setDoc(doc(db, 'sessions', String(userId)), {
      ...session,
      updatedAt: Date.now()
    });
  },

  /** Elimina la sesión cuando se completa o cancela el flujo */
  delete: async (userId: number): Promise<void> => {
    try {
      await deleteDoc(doc(db, 'sessions', String(userId)));
    } catch {
      // Ignorar si ya no existe
    }
  }
};

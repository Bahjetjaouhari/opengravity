import { initializeApp } from 'firebase/app';
import { getFirestore, collection, addDoc, getDocs, deleteDoc, query, where, orderBy } from 'firebase/firestore';
import { env } from '../config/env.js';

const firebaseConfig = {
  apiKey: env.FIREBASE_API_KEY,
  authDomain: env.FIREBASE_AUTH_DOMAIN,
  projectId: env.FIREBASE_PROJECT_ID,
  storageBucket: env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.FIREBASE_MESSAGING_SENDER_ID,
  appId: env.FIREBASE_APP_ID
};

// Inicializamos la app de Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

export interface DBMessage {
  id?: string;
  user_id: number;
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  name?: string;
  tool_call_id?: string;
  tool_calls?: string; // Almacenado como JSON
  timestamp?: string; 
}

export const memory = {
  addMessage: async (msg: DBMessage) => {
    try {
      await addDoc(collection(db, "messages"), {
        user_id: msg.user_id,
        role: msg.role,
        content: msg.content || '',
        name: msg.name || null,
        tool_call_id: msg.tool_call_id || null,
        tool_calls: msg.tool_calls || null,
        timestamp: new Date().toISOString()
      });
    } catch (e) {
      console.error("[Firestore] Error guardando mensaje:", e);
    }
  },

  getMessages: async (user_id: number, limitCount = 50): Promise<any[]> => {
    try {
      const q = query(
        collection(db, "messages"),
        where("user_id", "==", user_id),
        orderBy("timestamp", "asc")
      );
      
      const querySnapshot = await getDocs(q);
      const rows: any[] = [];
      querySnapshot.forEach((doc) => {
        rows.push(doc.data());
      });

      return rows.map(row => {
        const result: any = {
          role: row.role,
          content: row.content !== '' ? row.content : null
        };
        if (row.name) result.name = row.name;
        if (row.tool_call_id) result.tool_call_id = row.tool_call_id;
        if (row.tool_calls) result.tool_calls = JSON.parse(row.tool_calls);
        return result;
      });
    } catch (e) {
      console.error("[Firestore] Error obteniendo mensajes:", e);
      return [];
    }
  },

  clearHistory: async (user_id: number) => {
    try {
      const q = query(collection(db, "messages"), where("user_id", "==", user_id));
      const querySnapshot = await getDocs(q);
      
      // Eliminamos en paralelo para ser rápidos
      const promises = querySnapshot.docs.map(doc => deleteDoc(doc.ref));
      await Promise.all(promises);
    } catch (e) {
      console.error("[Firestore] Error limpiando memoria:", e);
    }
  }
};

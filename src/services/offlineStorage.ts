import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SQLite from 'expo-sqlite';

export interface PendingPurchase {
  id?: number;
  usuario_id: number;
  numero_factura: string;
  items_json: string;
  subtotal: number;
  iva: number;
  total: number;
  created_at?: string;
  synced: number; // 0 = pendiente, 1 = sincronizado
}

export interface LocalUser {
  id: number;
  nombre: string;
  correo: string;
  contrasena: string;
}

// Usuario offline por defecto (único usuario de la app)
export const DEFAULT_OFFLINE_USER: LocalUser = {
  id: 1,
  nombre: 'James',
  correo: 'james',
  contrasena: '123456'
};

const STORAGE_KEYS = {
  PURCHASES: 'carrito_offline_purchases',
  PRODUCTS: 'carrito_offline_products_cache',
  USERS: 'carrito_offline_users'
};

let dbInstance: any = null;
let dbInitPromise: Promise<any> | null = null;
let useWebFallback = Platform.OS === 'web';

// Inicializa SQLite (en móvil) o gestiona fallback robusto en Web
export async function getDatabase() {
  if (Platform.OS === 'web') {
    // Inicializar el usuario admin en AsyncStorage en Web
    await initOfflineAdminWeb();
    return null;
  }

  if (dbInstance) return dbInstance;
  if (dbInitPromise) return dbInitPromise;

  dbInitPromise = (async () => {
    try {
      dbInstance = await SQLite.openDatabaseAsync('carrito_offline.db');

      // Crear tablas locales
      await dbInstance.execAsync(`
        CREATE TABLE IF NOT EXISTS usuarios_locales (
          id INTEGER PRIMARY KEY,
          nombre TEXT NOT NULL,
          correo TEXT UNIQUE NOT NULL,
          contrasena TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS compras_offline (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          usuario_id INTEGER NOT NULL,
          numero_factura TEXT NOT NULL,
          items_json TEXT NOT NULL,
          subtotal REAL NOT NULL,
          iva REAL NOT NULL,
          total REAL NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          synced INTEGER DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS productos_cache (
          id INTEGER PRIMARY KEY,
          nombreproducto TEXT NOT NULL,
          imagenproducto TEXT NOT NULL,
          precio REAL NOT NULL
        );
      `);

      // Asegurar que james sea el único usuario local en SQLite
      await dbInstance.runAsync(
        `INSERT OR REPLACE INTO usuarios_locales (id, nombre, correo, contrasena) VALUES (?, ?, ?, ?);`,
        [DEFAULT_OFFLINE_USER.id, DEFAULT_OFFLINE_USER.nombre, DEFAULT_OFFLINE_USER.correo, DEFAULT_OFFLINE_USER.contrasena]
      );
      await dbInstance.runAsync(
        `DELETE FROM usuarios_locales WHERE LOWER(correo) <> ?;`,
        [DEFAULT_OFFLINE_USER.correo.toLowerCase()]
      );

      console.log('[SQLite] Base de datos local y usuario admin offline inicializados exitosamente.');
      return dbInstance;
    } catch (error) {
      console.warn('[SQLite] No se pudo inicializar SQLite nativo, usando fallback:', error);
      useWebFallback = true;
      await initOfflineAdminWeb();
      return null;
    } finally {
      dbInitPromise = null;
    }
  })();

  return dbInitPromise;
}

// Inicializar a james como único usuario local en Web/AsyncStorage
async function initOfflineAdminWeb() {
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify([DEFAULT_OFFLINE_USER]));
  } catch (e) {
    console.error('Error inicializando usuario web:', e);
  }
}

// Validar login offline contra SQLite o AsyncStorage
export async function authenticateOffline(correo: string, contrasena: string): Promise<{ user: { id: number; nombre: string; correo: string }; token: string } | null> {
  const normEmail = correo.trim().toLowerCase();
  const db = await getDatabase();

  if (db && !useWebFallback) {
    try {
      const row = await db.getFirstAsync(
        `SELECT id, nombre, correo FROM usuarios_locales WHERE LOWER(correo) = ? AND contrasena = ?;`,
        [normEmail, contrasena.trim()]
      );
      if (row) {
        return {
          user: row as { id: number; nombre: string; correo: string },
          token: 'offline_token_' + Date.now()
        };
      }
    } catch (e) {
      console.warn('[SQLite] Error buscando usuario local en SQLite:', e);
    }
  }

  // Fallback Web / AsyncStorage o verificación directa con DEFAULT_OFFLINE_USER
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.USERS);
    const users: LocalUser[] = raw ? JSON.parse(raw) : [DEFAULT_OFFLINE_USER];
    const found = users.find(u => u.correo.toLowerCase() === normEmail && u.contrasena === contrasena.trim());
    if (found) {
      return {
        user: { id: found.id, nombre: found.nombre, correo: found.correo },
        token: 'offline_token_' + Date.now()
      };
    }
  } catch (e) {
    console.warn('Error verificando usuario offline en storage:', e);
  }

  // Comprobación de seguridad directa para james
  if (normEmail === DEFAULT_OFFLINE_USER.correo.toLowerCase() && contrasena.trim() === DEFAULT_OFFLINE_USER.contrasena) {
    return {
      user: { id: DEFAULT_OFFLINE_USER.id, nombre: DEFAULT_OFFLINE_USER.nombre, correo: DEFAULT_OFFLINE_USER.correo },
      token: 'offline_token_' + Date.now()
    };
  }

  return null;
}

// Helpers para Web/Fallback con AsyncStorage
async function getStoredPurchasesWeb(): Promise<PendingPurchase[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.PURCHASES);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.error('Error leyendo compras offline web:', e);
    return [];
  }
}

async function setStoredPurchasesWeb(purchases: PendingPurchase[]): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.PURCHASES, JSON.stringify(purchases));
  } catch (e) {
    console.error('Error guardando compras offline web:', e);
  }
}

// Guardar una compra localmente (SQLite en Android/iOS, AsyncStorage en Web)
export async function savePurchaseOffline(purchase: Omit<PendingPurchase, 'id' | 'created_at' | 'synced'>): Promise<number> {
  const db = await getDatabase();

  if (!db || useWebFallback) {
    const purchases = await getStoredPurchasesWeb();
    const newId = Date.now();
    const newRecord: PendingPurchase = {
      ...purchase,
      id: newId,
      synced: 0,
      created_at: new Date().toISOString()
    };
    purchases.unshift(newRecord);
    await setStoredPurchasesWeb(purchases);

    console.log(`\n========================================`);
    console.log(`📦 [Offline Storage] ¡COMPRA GUARDADA LOCALMENTE (WEB/LOCAL)!`);
    console.log(`ID: ${newId}`);
    console.log(`Factura: ${purchase.numero_factura}`);
    console.log(`Subtotal: $${purchase.subtotal} | IVA: $${purchase.iva} | Total: $${purchase.total}`);
    console.log(`Estado: Pendiente de sincronizar a Neon Database (synced = 0)`);
    console.log(`========================================\n`);
    return newId;
  }

  const result = await db.runAsync(
    `INSERT INTO compras_offline (usuario_id, numero_factura, items_json, subtotal, iva, total, synced)
     VALUES (?, ?, ?, ?, ?, ?, 0);`,
    [
      purchase.usuario_id,
      purchase.numero_factura,
      purchase.items_json,
      purchase.subtotal,
      purchase.iva,
      purchase.total
    ]
  );

  console.log(`\n========================================`);
  console.log(`📦 [SQLite] ¡COMPRA GUARDADA LOCALMENTE (SQLITE)!`);
  console.log(`ID SQLite: ${result.lastInsertRowId}`);
  console.log(`Factura: ${purchase.numero_factura}`);
  console.log(`Subtotal: $${purchase.subtotal} | IVA: $${purchase.iva} | Total: $${purchase.total}`);
  console.log(`Estado: Pendiente de sincronizar a Neon Database (synced = 0)`);
  console.log(`========================================\n`);

  return result.lastInsertRowId;
}

// Obtener todas las compras locales (tanto pendientes como sincronizadas)
export async function getAllOfflinePurchases(): Promise<PendingPurchase[]> {
  const db = await getDatabase();
  if (!db || useWebFallback) {
    return await getStoredPurchasesWeb();
  }

  try {
    const rows = await db.getAllAsync(`SELECT * FROM compras_offline ORDER BY id DESC;`);
    return rows as PendingPurchase[];
  } catch (e) {
    console.warn('[SQLite] Falló getAllAsync, consultando fallback:', e);
    return await getStoredPurchasesWeb();
  }
}

// Obtener solo las compras pendientes de sincronizar (synced = 0)
export async function getPendingPurchases(): Promise<PendingPurchase[]> {
  const db = await getDatabase();
  if (!db || useWebFallback) {
    const all = await getStoredPurchasesWeb();
    return all.filter(p => p.synced === 0);
  }

  try {
    const rows = await db.getAllAsync(`SELECT * FROM compras_offline WHERE synced = 0;`);
    return rows as PendingPurchase[];
  } catch (e) {
    console.warn('[SQLite] Falló getPendingPurchases, consultando fallback:', e);
    const all = await getStoredPurchasesWeb();
    return all.filter(p => p.synced === 0);
  }
}

// Marcar como sincronizada
export async function markAsSynced(localId: number) {
  const db = await getDatabase();
  if (db && !useWebFallback) {
    try {
      await db.runAsync(`UPDATE compras_offline SET synced = 1 WHERE id = ?;`, [localId]);
    } catch (e) {
      console.warn('[SQLite] Error actualizando status en SQLite:', e);
    }
  }

  const all = await getStoredPurchasesWeb();
  if (all.some(p => p.id === localId)) {
    const updated = all.map(p => p.id === localId ? { ...p, synced: 1 } : p);
    await setStoredPurchasesWeb(updated);
  }

  console.log(`✅ [Offline Storage] Registro local #${localId} marcado como sincronizado.`);
}

// Guardar productos en caché local para cuando no haya internet
export async function cacheProductsLocally(products: any[]) {
  const db = await getDatabase();
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.PRODUCTS, JSON.stringify(products));
  } catch {}

  if (db && !useWebFallback) {
    try {
      for (const p of products) {
        await db.runAsync(
          `INSERT OR REPLACE INTO productos_cache (id, nombreproducto, imagenproducto, precio) VALUES (?, ?, ?, ?);`,
          [p.id, p.nombreproducto, p.imagenproducto, parseFloat(p.precio)]
        );
      }
      console.log(`📦 [SQLite] ${products.length} productos cacheados localmente para modo offline.`);
    } catch (e) {
      console.warn('[SQLite] Error cacheando productos en SQLite:', e);
    }
  }
}

// Obtener productos en caché si no hay internet
export async function getLocalProducts(): Promise<any[]> {
  const db = await getDatabase();
  if (db && !useWebFallback) {
    try {
      const rows = await db.getAllAsync(`SELECT * FROM productos_cache;`);
      if (rows && rows.length > 0) return rows;
    } catch {}
  }

  try {
    const cached = await AsyncStorage.getItem(STORAGE_KEYS.PRODUCTS);
    return cached ? JSON.parse(cached) : [];
  } catch {
    return [];
  }
}

// Helper para depuración en consola
if (typeof window !== 'undefined') {
  (window as any).verSQLite = getAllOfflinePurchases;
  (window as any).verProductosLocales = getLocalProducts;
}

import NetInfo, { NetInfoState } from '@react-native-community/netinfo';
import { SERVICES_CONFIG } from '../context/AppContext';
import { getPendingPurchases, markAsSynced } from './offlineStorage';

let isSyncing = false;

/** Tiempo máximo de espera para no dejar la UI colgada sin internet. */
const GATEWAY_TIMEOUT_MS = 8000;
const DIRECT_TIMEOUT_MS = 20000;

/** Indica si hay conexión real (no solo estar conectado a una red). */
export async function isOnline(): Promise<boolean> {
  try {
    const state = await NetInfo.fetch();
    // En web, isInternetReachable puede quedar en false por el chequeo HEAD
    // interno de NetInfo aunque el navegador sí tenga internet. Por eso solo
    // se considera offline cuando el dispositivo dice explícitamente que no
    // está conectado; si hay duda, se intenta la petición (con timeout).
    return state.isConnected !== false;
  } catch {
    return true;
  }
}

/** fetch con AbortController para que un servicio dormido no bloquee la app. */
async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number
): Promise<Response | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Envía una compra a la nube. Intenta el gateway y, si falla, el microservicio
 * de órdenes directo. Devuelve true solo si la nube confirmó la operación.
 */
export async function sendCheckout(payload: unknown): Promise<boolean> {
  const options: RequestInit = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  };

  let response = await fetchWithTimeout(
    `${SERVICES_CONFIG.GATEWAY_URL}/orders/checkout`,
    options,
    GATEWAY_TIMEOUT_MS
  );
  console.log(`[Checkout] gateway -> ${response ? response.status : 'sin respuesta'}`);

  if (!response || !response.ok) {
    response = await fetchWithTimeout(
      `${SERVICES_CONFIG.ORDERS_URL}/checkout`,
      options,
      DIRECT_TIMEOUT_MS
    );
    console.log(`[Checkout] orders directo -> ${response ? response.status : 'sin respuesta'}`);
  }

  return Boolean(response && response.ok);
}

/**
 * Sincroniza todas las compras guardadas en SQLite local (synced = 0) hacia
 * el microservicio de órdenes. Se ejecuta al recuperar la conexión.
 */
export async function syncPendingPurchases(): Promise<number> {
  if (isSyncing) return 0;

  if (!(await isOnline())) {
    console.log('📴 [Sync] Sin conexión: las compras quedan pendientes en SQLite.');
    return 0;
  }

  isSyncing = true;
  try {
    const pending = await getPendingPurchases();
    if (pending.length === 0) {
      console.log('🔄 [Sync] No hay compras pendientes en SQLite.');
      return 0;
    }

    console.log(`🔄 [Sync] Sincronizando ${pending.length} compra(s) local(es)...`);
    let syncedCount = 0;

    for (const record of pending) {
      let items: unknown;
      try {
        items = JSON.parse(record.items_json);
      } catch {
        console.warn(`[Sync] La compra ${record.numero_factura} tiene items inválidos; se omite.`);
        continue;
      }

      const ok = await sendCheckout({
        usuario_id: record.usuario_id,
        items,
        numero_factura: record.numero_factura
      });

      if (ok && record.id) {
        await markAsSynced(record.id);
        syncedCount++;
      }
    }

    console.log(`🎉 [Sync] ${syncedCount} de ${pending.length} compras subidas a Neon.`);
    return syncedCount;
  } catch (error) {
    console.error('Error durante la sincronización:', error);
    return 0;
  } finally {
    isSyncing = false;
  }
}

/**
 * Escucha cambios de conexión para sincronizar automáticamente al volver
 * internet (igual que el patrón de la app de Pokemon).
 */
export function initNetworkSyncListener(onSyncCompleted?: (count: number) => void) {
  return NetInfo.addEventListener((state: NetInfoState) => {
    const online = state.isConnected !== false;
    console.log(`📶 [Red] ${online ? 'ONLINE' : 'OFFLINE'}`);

    if (online) {
      syncPendingPurchases().then((count) => {
        if (count > 0 && onSyncCompleted) onSyncCompleted(count);
      });
    }
  });
}

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  Image,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  Platform
} from 'react-native';
import { useRouter } from 'expo-router';
import { useApp, SERVICES_CONFIG } from '../context/AppContext';
import { getAllOfflinePurchases, PendingPurchase } from '../services/offlineStorage';
import { syncPendingPurchases } from '../services/syncService';

interface OrderItem {
  id?: number;
  producto_id?: number;
  nombreproducto?: string;
  imagenproducto?: string;
  cantidad: number;
  precio_unitario?: number | string;
  subtotal?: number | string;
  iva?: number | string;
  total?: number | string;
}

interface GroupedOrder {
  numero_factura: string;
  fecha: string;
  subtotal: number;
  iva: number;
  total: number;
  items: OrderItem[];
  isOffline: boolean;
  synced: boolean;
}

export default function MyOrdersScreen() {
  const router = useRouter();
  const { user } = useApp();

  const [orders, setOrders] = useState<GroupedOrder[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [syncing, setSyncing] = useState<boolean>(false);

  useEffect(() => {
    if (!user) {
      router.replace('/');
    }
  }, [user]);

  const loadOrders = async () => {
    if (!user) return;
    try {
      // 1. Cargar compras locales (SQLite / Storage)
      const offlinePurchases: PendingPurchase[] = await getAllOfflinePurchases();
      const userOffline = offlinePurchases.filter(p => p.usuario_id === user.id);

      // 2. Intentar cargar compras desde Neon Database a través del microservicio
      let onlineOrders: any[] = [];
      try {
        let res = await fetch(`${SERVICES_CONFIG.GATEWAY_URL}/orders/user-orders/${user.id}`).catch(() => null);
        if (!res || !res.ok) {
          res = await fetch(`${SERVICES_CONFIG.ORDERS_URL}/user-orders/${user.id}`).catch(() => null);
        }
        if (res && res.ok) {
          onlineOrders = await res.json();
        }
      } catch (e) {
        console.warn('No se pudo conectar a los microservicios en la nube:', e);
      }

      // 3. Agrupar compras online por factura
      const groupedMap = new Map<string, GroupedOrder>();

      // Primero procesar las que vienen de la nube
      for (const row of onlineOrders) {
        const fac = row.numero_factura;
        if (!groupedMap.has(fac)) {
          groupedMap.set(fac, {
            numero_factura: fac,
            fecha: row.fecha_compra ? new Date(row.fecha_compra).toLocaleString() : 'Reciente',
            subtotal: 0,
            iva: 0,
            total: 0,
            items: [],
            isOffline: false,
            synced: true
          });
        }
        const order = groupedMap.get(fac)!;
        order.subtotal += parseFloat(row.subtotal || 0);
        order.iva += parseFloat(row.iva || 0);
        order.total += parseFloat(row.total || 0);
        order.items.push({
          id: row.id,
          producto_id: row.producto_id,
          nombreproducto: row.nombreproducto || `Producto #${row.producto_id}`,
          imagenproducto: row.imagenproducto,
          cantidad: row.cantidad,
          precio_unitario: row.precio_unitario,
          subtotal: row.subtotal,
          iva: row.iva,
          total: row.total
        });
      }

      // Luego fusionar las guardadas localmente en SQLite
      for (const off of userOffline) {
        const fac = off.numero_factura;
        if (!groupedMap.has(fac)) {
          let parsedItems: any[] = [];
          try {
            parsedItems = JSON.parse(off.items_json);
          } catch {
            parsedItems = [];
          }

          groupedMap.set(fac, {
            numero_factura: fac,
            fecha: off.created_at ? new Date(off.created_at).toLocaleString() : 'Reciente (Local)',
            subtotal: off.subtotal,
            iva: off.iva,
            total: off.total,
            items: parsedItems.map((p: any) => ({
              nombreproducto: p.nombreproducto,
              imagenproducto: p.imagenproducto,
              cantidad: p.cantidad,
              precio_unitario: p.precio,
              total: Number(p.precio) * p.cantidad
            })),
            isOffline: true,
            synced: off.synced === 1
          });
        }
      }

      const list = Array.from(groupedMap.values());
      setOrders(list);
    } catch (err) {
      console.error('Error cargando compras:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadOrders();
  }, [user]);

  const onRefresh = () => {
    setRefreshing(true);
    loadOrders();
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      await syncPendingPurchases();
      await loadOrders();
    } finally {
      setSyncing(false);
    }
  };

  const renderOrderCard = ({ item }: { item: GroupedOrder }) => (
    <View style={styles.orderCard}>
      {/* Encabezado de la factura */}
      <View style={styles.orderHeader}>
        <View>
          <Text style={styles.invoiceNumber}>{item.numero_factura}</Text>
          <Text style={styles.orderDate}>{item.fecha}</Text>
        </View>
        <View style={styles.statusBadgeContainer}>
          {item.synced ? (
            <View style={[styles.badge, styles.badgeSynced]}>
              <Text style={styles.badgeTextSynced}>☁️ En Neon DB</Text>
            </View>
          ) : (
            <View style={[styles.badge, styles.badgePending]}>
              <Text style={styles.badgeTextPending}>⏳ SQLite (Pendiente de subir)</Text>
            </View>
          )}
        </View>
      </View>

      <View style={styles.divider} />

      {/* Lista de productos comprados */}
      <View style={styles.itemsList}>
        {item.items.map((prod, idx) => (
          <View key={idx} style={styles.itemRow}>
            {prod.imagenproducto ? (
              <Image source={{ uri: prod.imagenproducto }} style={styles.prodImage} resizeMode="cover" />
            ) : (
              <View style={[styles.prodImage, styles.noImage]}>
                <Text style={styles.noImageText}>📦</Text>
              </View>
            )}
            <View style={styles.prodInfo}>
              <Text style={styles.prodName} numberOfLines={1}>
                {prod.nombreproducto}
              </Text>
              <Text style={styles.prodDetails}>
                {prod.cantidad} x ${Number(prod.precio_unitario || (Number(prod.total) / (prod.cantidad || 1))).toFixed(2)}
              </Text>
            </View>
            <Text style={styles.prodTotal}>
              ${Number(prod.total || prod.subtotal || 0).toFixed(2)}
            </Text>
          </View>
        ))}
      </View>

      <View style={styles.divider} />

      {/* Totales */}
      <View style={styles.totalsContainer}>
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Subtotal:</Text>
          <Text style={styles.totalVal}>${item.subtotal.toFixed(2)}</Text>
        </View>
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>IVA (19%):</Text>
          <Text style={styles.totalVal}>${item.iva.toFixed(2)}</Text>
        </View>
        <View style={[styles.totalRow, styles.grandTotalRow]}>
          <Text style={styles.grandTotalLabel}>Total Pagado:</Text>
          <Text style={styles.grandTotalVal}>${item.total.toFixed(2)}</Text>
        </View>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      {/* Barra de acción */}
      <View style={styles.topActions}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.replace('/products')}>
          <Text style={styles.backBtnText}>← Volver a la Tienda</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.syncBtn, syncing && styles.btnDisabled]}
          onPress={handleSync}
          disabled={syncing}
        >
          {syncing ? (
            <ActivityIndicator size="small" color="#ffffff" />
          ) : (
            <Text style={styles.syncBtnText}>🔄 Sincronizar</Text>
          )}
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#111827" />
          <Text style={styles.loadingText}>Cargando historial de compras...</Text>
        </View>
      ) : orders.length === 0 ? (
        <View style={styles.centerContainer}>
          <Text style={styles.emptyIcon}>🛍️</Text>
          <Text style={styles.emptyTitle}>Aún no tienes compras</Text>
          <Text style={styles.emptySub}>
            Las compras que hagas (incluso sin internet) se guardarán en SQLite y aparecerán aquí.
          </Text>
          <TouchableOpacity
            style={styles.exploreBtn}
            onPress={() => router.replace('/products')}
          >
            <Text style={styles.exploreBtnText}>Explorar Catálogo</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={orders}
          keyExtractor={(item) => item.numero_factura}
          renderItem={renderOrderCard}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb'
  },
  topActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb'
  },
  backBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: '#f3f4f6'
  },
  backBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151'
  },
  syncBtn: {
    backgroundColor: '#4f46e5',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8
  },
  syncBtnText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 12
  },
  btnDisabled: {
    opacity: 0.6
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24
  },
  loadingText: {
    marginTop: 12,
    color: '#6b7280',
    fontSize: 14
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 12
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 6
  },
  emptySub: {
    fontSize: 13,
    color: '#6b7280',
    textAlign: 'center',
    maxWidth: 320,
    marginBottom: 20
  },
  exploreBtn: {
    backgroundColor: '#111827',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8
  },
  exploreBtnText: {
    color: '#ffffff',
    fontWeight: '600',
    fontSize: 14
  },
  listContent: {
    padding: 16,
    maxWidth: 720,
    width: '100%',
    alignSelf: 'center'
  },
  orderCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2
  },
  orderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start'
  },
  invoiceNumber: {
    fontSize: 16,
    fontWeight: '800',
    color: '#111827'
  },
  orderDate: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 2
  },
  statusBadgeContainer: {
    alignItems: 'flex-end'
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6
  },
  badgeSynced: {
    backgroundColor: '#ecfdf5'
  },
  badgeTextSynced: {
    color: '#059669',
    fontSize: 11,
    fontWeight: '700'
  },
  badgePending: {
    backgroundColor: '#fef3c7'
  },
  badgeTextPending: {
    color: '#d97706',
    fontSize: 11,
    fontWeight: '700'
  },
  divider: {
    height: 1,
    backgroundColor: '#f3f4f6',
    marginVertical: 12
  },
  itemsList: {
    gap: 10
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  prodImage: {
    width: 44,
    height: 44,
    borderRadius: 6,
    backgroundColor: '#f3f4f6'
  },
  noImage: {
    justifyContent: 'center',
    alignItems: 'center'
  },
  noImageText: {
    fontSize: 18
  },
  prodInfo: {
    flex: 1,
    marginLeft: 12
  },
  prodName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1f2937'
  },
  prodDetails: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 2
  },
  prodTotal: {
    fontSize: 13,
    fontWeight: '700',
    color: '#111827'
  },
  totalsContainer: {
    gap: 4
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between'
  },
  totalLabel: {
    fontSize: 12,
    color: '#6b7280'
  },
  totalVal: {
    fontSize: 12,
    fontWeight: '600',
    color: '#374151'
  },
  grandTotalRow: {
    marginTop: 4,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6'
  },
  grandTotalLabel: {
    fontSize: 14,
    fontWeight: '800',
    color: '#111827'
  },
  grandTotalVal: {
    fontSize: 15,
    fontWeight: '800',
    color: '#059669'
  }
});

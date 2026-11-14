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
  Alert,
  Platform
} from 'react-native';
import { useRouter } from 'expo-router';
import { useApp, SERVICES_CONFIG } from '../context/AppContext';
import { getAllOfflinePurchases, removeOfflinePurchase, PendingPurchase } from '../services/offlineStorage';
import { syncPendingPurchases } from '../services/syncService';
import { COLORS, RADIUS, SHADOW } from '../constants/brand';

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
  estado: string;
  localId?: number;
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
      const userOffline = offlinePurchases.filter((p) => p.usuario_id === user.id);

      // 2. Intentar cargar compras desde Neon a través del microservicio
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

      const groupedMap = new Map<string, GroupedOrder>();

      // Primero las que vienen de la nube
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
            synced: true,
            estado: row.estado || 'activa'
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

      // Luego fusionar las guardadas localmente
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
            synced: off.synced === 1,
            estado: off.synced === 1 ? 'activa' : 'pendiente',
            localId: off.id
          });
        }
      }

      setOrders(Array.from(groupedMap.values()));
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

  const handleCancel = (order: GroupedOrder) => {
    const doCancel = async () => {
      try {
        // Compra pendiente en local: aún no se descontó stock en el servidor.
        if (order.isOffline && !order.synced && order.localId) {
          await removeOfflinePurchase(order.localId);
          await loadOrders();
          if (Platform.OS !== 'web') Alert.alert('Compra cancelada', 'Se eliminó la compra pendiente.');
          return;
        }

        const options: RequestInit = {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-user-role': user?.rol || ''
          },
          body: JSON.stringify({
            numero_factura: order.numero_factura,
            usuario_id: user?.id
          })
        };

        let response = await fetch(`${SERVICES_CONFIG.GATEWAY_URL}/orders/cancel`, options).catch(() => null);
        if (!response || !response.ok) {
          response = await fetch(`${SERVICES_CONFIG.ORDERS_URL}/cancel`, options).catch(() => null);
        }
        const data = response ? await response.json().catch(() => ({})) : {};
        if (!response || !response.ok) {
          throw new Error(data.error || 'No se pudo cancelar la compra');
        }

        await loadOrders();
        if (Platform.OS !== 'web') {
          Alert.alert('Compra cancelada', 'El stock de los productos fue devuelto.');
        }
      } catch (err: any) {
        const msg = err.message || 'No se pudo cancelar la compra';
        if (Platform.OS !== 'web') Alert.alert('Error', msg);
        else alert(msg);
      }
    };

    const question = '¿Cancelar esta compra y devolver el stock?';
    if (Platform.OS === 'web') {
      if (window.confirm(question)) doCancel();
    } else {
      Alert.alert('Cancelar compra', question, [
        { text: 'No', style: 'cancel' },
        { text: 'Sí, cancelar', style: 'destructive', onPress: doCancel }
      ]);
    }
  };

  const renderOrderCard = ({ item }: { item: GroupedOrder }) => (
    <View style={styles.orderCard}>
      <View style={styles.orderHeader}>
        <View style={styles.orderHeaderLeft}>
          <Text style={styles.invoiceLabel}>FACTURA</Text>
          <Text style={styles.invoiceNumber}>{item.numero_factura}</Text>
          <Text style={styles.orderDate}>{item.fecha}</Text>
        </View>
        <View style={styles.statusBadgeContainer}>
          {item.estado === 'cancelada' ? (
            <View style={[styles.badge, styles.badgeCanceled]}>
              <Text style={styles.badgeTextCanceled}>CANCELADA</Text>
            </View>
          ) : item.synced ? (
            <View style={[styles.badge, styles.badgeSynced]}>
              <Text style={styles.badgeTextSynced}>SINCRONIZADA</Text>
            </View>
          ) : (
            <View style={[styles.badge, styles.badgePending]}>
              <Text style={styles.badgeTextPending}>PENDIENTE</Text>
            </View>
          )}
        </View>
      </View>

      <View style={styles.divider} />

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

      <View style={styles.totalsContainer}>
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Subtotal</Text>
          <Text style={styles.totalVal}>${item.subtotal.toFixed(2)}</Text>
        </View>
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>IVA (19%)</Text>
          <Text style={styles.totalVal}>${item.iva.toFixed(2)}</Text>
        </View>
        <View style={[styles.totalRow, styles.grandTotalRow]}>
          <Text style={styles.grandTotalLabel}>Total pagado</Text>
          <Text style={styles.grandTotalVal}>${item.total.toFixed(2)}</Text>
        </View>
      </View>

      {item.estado !== 'cancelada' && (
        <TouchableOpacity style={styles.cancelBtn} onPress={() => handleCancel(item)}>
          <Text style={styles.cancelBtnText}>Cancelar compra y devolver stock</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.topActions}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.replace('/products')}>
          <Text style={styles.backBtnText}>← Catálogo</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.syncBtn, syncing && styles.btnDisabled]}
          onPress={handleSync}
          disabled={syncing}
        >
          {syncing ? (
            <ActivityIndicator size="small" color={COLORS.primaryText} />
          ) : (
            <Text style={styles.syncBtnText}>Sincronizar</Text>
          )}
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>Cargando historial de compras...</Text>
        </View>
      ) : orders.length === 0 ? (
        <View style={styles.centerContainer}>
          <Text style={styles.emptyIcon}>🛍️</Text>
          <Text style={styles.emptyTitle}>Aún no tienes compras</Text>
          <Text style={styles.emptySub}>
            Las compras que hagas (incluso sin internet) se guardarán en la base local y aparecerán aquí.
          </Text>
          <TouchableOpacity
            style={styles.exploreBtn}
            onPress={() => router.replace('/products')}
          >
            <Text style={styles.exploreBtnText}>Explorar catálogo</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={orders}
          keyExtractor={(item) => item.numero_factura}
          renderItem={renderOrderCard}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={COLORS.primary}
              colors={[COLORS.primary]}
            />
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg
  },
  topActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderSoft
  },
  backBtn: {
    paddingVertical: 8,
    paddingHorizontal: 13,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    borderColor: COLORS.border
  },
  backBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textMuted
  },
  syncBtn: {
    backgroundColor: COLORS.primary,
    paddingVertical: 9,
    paddingHorizontal: 16,
    borderRadius: RADIUS.pill
  },
  syncBtnText: {
    color: COLORS.primaryText,
    fontWeight: '900',
    fontSize: 12
  },
  btnDisabled: {
    opacity: 0.6
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 28
  },
  loadingText: {
    marginTop: 14,
    color: COLORS.textMuted,
    fontSize: 13
  },
  emptyIcon: {
    fontSize: 46,
    marginBottom: 14
  },
  emptyTitle: {
    fontSize: 21,
    fontWeight: '900',
    color: COLORS.text,
    marginBottom: 8,
    letterSpacing: -0.4
  },
  emptySub: {
    fontSize: 13,
    color: COLORS.textMuted,
    textAlign: 'center',
    maxWidth: 330,
    marginBottom: 22,
    lineHeight: 20
  },
  exploreBtn: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: RADIUS.md
  },
  exploreBtnText: {
    color: COLORS.primaryText,
    fontWeight: '800',
    fontSize: 14
  },
  listContent: {
    padding: 18,
    paddingBottom: 36,
    maxWidth: 760,
    width: '100%',
    alignSelf: 'center'
  },
  orderCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: COLORS.borderSoft,
    ...SHADOW.soft
  },
  orderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 10
  },
  orderHeaderLeft: {
    flex: 1
  },
  invoiceLabel: {
    color: COLORS.textDim,
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 1.8,
    marginBottom: 3
  },
  invoiceNumber: {
    fontSize: 16,
    fontWeight: '900',
    color: COLORS.text,
    letterSpacing: -0.2
  },
  orderDate: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginTop: 3
  },
  statusBadgeContainer: {
    alignItems: 'flex-end'
  },
  badge: {
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: RADIUS.pill,
    borderWidth: 1
  },
  badgeSynced: {
    backgroundColor: COLORS.successSoft,
    borderColor: 'rgba(62, 230, 161, 0.35)'
  },
  badgeTextSynced: {
    color: COLORS.success,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.8
  },
  badgePending: {
    backgroundColor: COLORS.warningSoft,
    borderColor: 'rgba(255, 200, 87, 0.35)'
  },
  badgeTextPending: {
    color: COLORS.warning,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.8
  },
  badgeCanceled: {
    backgroundColor: COLORS.dangerSoft,
    borderColor: 'rgba(255, 107, 138, 0.35)'
  },
  badgeTextCanceled: {
    color: COLORS.danger,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.8
  },
  cancelBtn: {
    marginTop: 14,
    paddingVertical: 10,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: 'rgba(255, 107, 138, 0.4)',
    alignItems: 'center'
  },
  cancelBtnText: {
    color: COLORS.danger,
    fontSize: 11,
    fontWeight: '800'
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.borderSoft,
    marginVertical: 14
  },
  itemsList: {
    gap: 12
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  prodImage: {
    width: 46,
    height: 46,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.surfaceAlt
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
    fontWeight: '700',
    color: COLORS.text
  },
  prodDetails: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginTop: 3
  },
  prodTotal: {
    fontSize: 13,
    fontWeight: '800',
    color: COLORS.text
  },
  totalsContainer: {
    gap: 5
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between'
  },
  totalLabel: {
    fontSize: 12,
    color: COLORS.textMuted
  },
  totalVal: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.text
  },
  grandTotalRow: {
    marginTop: 5,
    paddingTop: 9,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderSoft
  },
  grandTotalLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: COLORS.text
  },
  grandTotalVal: {
    fontSize: 17,
    fontWeight: '900',
    color: COLORS.primary
  }
});

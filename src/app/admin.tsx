import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Image,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Platform
} from 'react-native';
import { useRouter } from 'expo-router';
import { useApp, Product, SERVICES_CONFIG } from '../context/AppContext';
import { COLORS, RADIUS, SHADOW } from '../constants/brand';

type AdminUser = {
  id: number;
  nombre: string;
  correo: string;
  rol: string;
  created_at?: string;
};

export default function AdminPanelScreen() {
  const router = useRouter();
  const { user } = useApp();

  const [tab, setTab] = useState<'stock' | 'users'>('stock');
  const [products, setProducts] = useState<Product[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [stockInputs, setStockInputs] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (!user) {
      router.replace('/');
    } else if (user.rol !== 'admin') {
      if (Platform.OS !== 'web') {
        Alert.alert('Acceso restringido', 'Solo el administrador puede entrar a este panel.');
      }
      router.replace('/products');
    }
  }, [user]);

  const adminHeaders = {
    'x-user-role': 'admin',
    'x-user-id': String(user?.id || '')
  };

  const fetchProducts = async () => {
    const getList = async (base: string) => {
      const res = await fetch(`${base}/products`).catch(() => null);
      if (!res || !res.ok) return null;
      const data = await res.json().catch(() => null);
      return Array.isArray(data) ? data : null;
    };

    let data = await getList(SERVICES_CONFIG.GATEWAY_URL);
    if (!data) data = await getList(SERVICES_CONFIG.PRODUCTS_URL);

    if (data) {
      setProducts(data);
      setStockInputs(Object.fromEntries(data.map((p: Product) => [p.id, String(p.stock ?? 0)])));
    } else {
      setErrorMsg('No se pudieron cargar los productos.');
    }
  };

  const fetchUsers = async () => {
    const getList = async (url: string) => {
      const res = await fetch(url, { headers: adminHeaders }).catch(() => null);
      if (!res || !res.ok) return null;
      const data = await res.json().catch(() => null);
      return Array.isArray(data) ? data : null;
    };

    let data = await getList(`${SERVICES_CONFIG.GATEWAY_URL}/auth/users`);
    if (!data) data = await getList(`${SERVICES_CONFIG.AUTH_URL}/users`);

    if (data) {
      setUsers(data);
    } else {
      setErrorMsg('No se pudieron cargar los usuarios. Verifica que auth-service esté actualizado.');
    }
  };

  const loadAll = async () => {
    setLoading(true);
    setErrorMsg('');
    await Promise.all([fetchProducts(), fetchUsers()]);
    setLoading(false);
  };

  useEffect(() => {
    loadAll();
  }, []);

  const patchStock = async (product: Product, body: { delta?: number; stock?: number }) => {
    setBusyId(product.id);
    try {
      const request = async (base: string) => {
        const res = await fetch(`${base}/products/${product.id}/stock`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', ...adminHeaders },
          body: JSON.stringify(body)
        }).catch(() => null);
        if (!res || !res.ok) return null;
        return res.json().catch(() => null);
      };

      let data = await request(SERVICES_CONFIG.GATEWAY_URL);
      if (!data) data = await request(SERVICES_CONFIG.PRODUCTS_URL);

      if (data?.product) {
        setProducts((prev) =>
          prev.map((p) => (p.id === product.id ? { ...p, stock: data.product.stock } : p))
        );
        setStockInputs((prev) => ({ ...prev, [product.id]: String(data.product.stock) }));
      } else {
        Alert.alert('Stock', 'No se pudo actualizar. Verifica que products-service esté actualizado.');
      }
    } finally {
      setBusyId(null);
    }
  };

  const saveExactStock = async (product: Product) => {
    const value = parseInt(stockInputs[product.id] ?? '', 10);
    if (!Number.isInteger(value) || value < 0) {
      Alert.alert('Stock', 'Escribe un número entero mayor o igual a 0.');
      return;
    }
    await patchStock(product, { stock: value });
  };

  const deleteUser = (target: AdminUser) => {
    const doDelete = async () => {
      setBusyId(target.id);
      try {
        const options: RequestInit = { method: 'DELETE', headers: adminHeaders };
        let res = await fetch(`${SERVICES_CONFIG.GATEWAY_URL}/auth/users/${target.id}`, options).catch(
          () => null
        );
        if (!res || !res.ok) {
          res = await fetch(`${SERVICES_CONFIG.AUTH_URL}/users/${target.id}`, options).catch(
            () => null
          );
        }
        const data = res ? await res.json().catch(() => ({})) : {};
        if (!res || !res.ok) {
          throw new Error(data.error || 'No se pudo eliminar el usuario');
        }
        await Promise.all([fetchUsers(), fetchProducts()]);
        if (Platform.OS !== 'web') {
          Alert.alert('Usuario eliminado', 'El stock de sus compras activas fue devuelto.');
        }
      } catch (err: any) {
        const msg = err.message || 'No se pudo eliminar el usuario';
        if (Platform.OS !== 'web') Alert.alert('Error', msg);
        else alert(msg);
      } finally {
        setBusyId(null);
      }
    };

    const question = `¿Eliminar a ${target.nombre} (${target.correo})? Se devolverá el stock de sus compras activas.`;
    if (Platform.OS === 'web') {
      if (window.confirm(question)) doDelete();
    } else {
      Alert.alert('Eliminar usuario', question, [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Eliminar', style: 'destructive', onPress: doDelete }
      ]);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.kicker}>ADMINISTRACIÓN</Text>
          <Text style={styles.title}>Panel de control</Text>
          <Text style={styles.subtitle}>Gestiona inventario y usuarios de JAMES Store.</Text>
        </View>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.replace('/products')}>
          <Text style={styles.backBtnText}>← Catálogo</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, tab === 'stock' && styles.tabActive]}
          onPress={() => setTab('stock')}
        >
          <Text style={[styles.tabText, tab === 'stock' && styles.tabTextActive]}>STOCK</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, tab === 'users' && styles.tabActive]}
          onPress={() => setTab('users')}
        >
          <Text style={[styles.tabText, tab === 'users' && styles.tabTextActive]}>USUARIOS</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.refreshBtn} onPress={loadAll}>
          <Text style={styles.refreshText}>Actualizar</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>Cargando panel...</Text>
        </View>
      ) : errorMsg ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{errorMsg}</Text>
        </View>
      ) : tab === 'stock' ? (
        <View>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>INVENTARIO</Text>
            <TouchableOpacity style={styles.newProductBtn} onPress={() => router.push('/add-product')}>
              <Text style={styles.newProductText}>+ Nuevo producto</Text>
            </TouchableOpacity>
          </View>

          {products.map((product) => {
            const stock = product.stock ?? 0;
            return (
              <View key={product.id} style={styles.row}>
                <Image
                  source={{ uri: product.imagenproducto }}
                  style={styles.productImage}
                  resizeMode="cover"
                />
                <View style={styles.productInfo}>
                  <Text style={styles.productName} numberOfLines={1}>
                    {product.nombreproducto}
                  </Text>
                  <Text style={styles.productMeta}>
                    ${Number(product.precio).toFixed(2)} · Stock actual: {stock}
                  </Text>
                </View>

                <View style={styles.stockEditor}>
                  <TouchableOpacity
                    style={styles.stepBtn}
                    onPress={() => patchStock(product, { delta: -1 })}
                    disabled={busyId === product.id}
                    accessibilityLabel={`Disminuir stock de ${product.nombreproducto}`}
                  >
                    <Text style={styles.stepBtnText}>−</Text>
                  </TouchableOpacity>
                  <TextInput
                    style={styles.stockInput}
                    value={stockInputs[product.id] ?? String(stock)}
                    onChangeText={(v) => setStockInputs((prev) => ({ ...prev, [product.id]: v }))}
                    keyboardType="number-pad"
                  />
                  <TouchableOpacity
                    style={styles.stepBtn}
                    onPress={() => patchStock(product, { delta: 1 })}
                    disabled={busyId === product.id}
                    accessibilityLabel={`Aumentar stock de ${product.nombreproducto}`}
                  >
                    <Text style={styles.stepBtnText}>+</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.saveBtn}
                    onPress={() => saveExactStock(product)}
                    disabled={busyId === product.id}
                  >
                    <Text style={styles.saveBtnText}>Guardar</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}
        </View>
      ) : (
        <View>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>USUARIOS ({users.length})</Text>
            <Text style={styles.sectionHint}>Eliminar devuelve stock de compras activas</Text>
          </View>

          {users.map((u) => {
            const isSelf = u.id === user?.id;
            return (
              <View key={u.id} style={styles.row}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{u.nombre.charAt(0).toUpperCase()}</Text>
                </View>
                <View style={styles.productInfo}>
                  <Text style={styles.productName}>{u.nombre}</Text>
                  <Text style={styles.productMeta}>{u.correo}</Text>
                </View>
                <View style={[styles.roleBadge, u.rol === 'admin' ? styles.roleAdmin : styles.roleClient]}>
                  <Text style={[styles.roleText, u.rol === 'admin' ? styles.roleTextAdmin : styles.roleTextClient]}>
                    {u.rol.toUpperCase()}
                  </Text>
                </View>
                {isSelf ? (
                  <Text style={styles.selfText}>Tu cuenta</Text>
                ) : (
                  <TouchableOpacity
                    style={styles.deleteBtn}
                    onPress={() => deleteUser(u)}
                    disabled={busyId === u.id}
                  >
                    <Text style={styles.deleteBtnText}>Eliminar</Text>
                  </TouchableOpacity>
                )}
              </View>
            );
          })}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg
  },
  content: {
    padding: 20,
    paddingBottom: 40,
    maxWidth: 1000,
    width: '100%',
    alignSelf: 'center'
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12
  },
  kicker: {
    color: COLORS.primary,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 2.4,
    marginBottom: 6
  },
  title: {
    color: COLORS.text,
    fontSize: 30,
    fontWeight: '900',
    letterSpacing: -1
  },
  subtitle: {
    color: COLORS.textMuted,
    fontSize: 13,
    marginTop: 6
  },
  backBtn: {
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    borderColor: COLORS.border
  },
  backBtnText: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontWeight: '700'
  },
  tabs: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 22,
    marginBottom: 18,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderSoft,
    paddingBottom: 10
  },
  tab: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: RADIUS.pill
  },
  tabActive: {
    backgroundColor: COLORS.primarySoft,
    borderWidth: 1,
    borderColor: 'rgba(201, 255, 61, 0.35)'
  },
  tabText: {
    color: COLORS.textDim,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.4
  },
  tabTextActive: {
    color: COLORS.primary
  },
  refreshBtn: {
    marginLeft: 'auto',
    paddingHorizontal: 10,
    paddingVertical: 7
  },
  refreshText: {
    color: COLORS.accent,
    fontSize: 11,
    fontWeight: '700'
  },
  center: {
    paddingVertical: 60,
    alignItems: 'center'
  },
  loadingText: {
    color: COLORS.textMuted,
    fontSize: 13,
    marginTop: 12
  },
  errorBox: {
    backgroundColor: COLORS.dangerSoft,
    borderWidth: 1,
    borderColor: 'rgba(255, 107, 138, 0.35)',
    borderRadius: RADIUS.md,
    padding: 14
  },
  errorText: {
    color: COLORS.danger,
    fontSize: 13,
    lineHeight: 19
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 12
  },
  sectionTitle: {
    color: COLORS.text,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 2
  },
  sectionHint: {
    color: COLORS.textDim,
    fontSize: 10,
    flex: 1,
    textAlign: 'right'
  },
  newProductBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.pill,
    paddingHorizontal: 12,
    paddingVertical: 7
  },
  newProductText: {
    color: COLORS.primaryText,
    fontSize: 11,
    fontWeight: '900'
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.borderSoft,
    borderRadius: RADIUS.md,
    padding: 12,
    marginBottom: 10,
    gap: 12,
    ...SHADOW.soft
  },
  productImage: {
    width: 52,
    height: 52,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.surfaceAlt
  },
  productInfo: {
    flex: 1
  },
  productName: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: '700'
  },
  productMeta: {
    color: COLORS.textMuted,
    fontSize: 11,
    marginTop: 3
  },
  stockEditor: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6
  },
  stepBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: COLORS.surfaceAlt,
    borderWidth: 1,
    borderColor: COLORS.border,
    justifyContent: 'center',
    alignItems: 'center'
  },
  stepBtnText: {
    color: COLORS.primary,
    fontSize: 16,
    fontWeight: '900'
  },
  stockInput: {
    width: 54,
    height: 34,
    backgroundColor: COLORS.surfaceAlt,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.sm,
    color: COLORS.text,
    textAlign: 'center',
    fontSize: 13,
    fontWeight: '800'
  },
  saveBtn: {
    backgroundColor: COLORS.primarySoft,
    borderWidth: 1,
    borderColor: 'rgba(201, 255, 61, 0.35)',
    borderRadius: RADIUS.sm,
    paddingHorizontal: 10,
    paddingVertical: 8
  },
  saveBtnText: {
    color: COLORS.primary,
    fontSize: 10,
    fontWeight: '900'
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.surfaceAlt,
    borderWidth: 1,
    borderColor: COLORS.border,
    justifyContent: 'center',
    alignItems: 'center'
  },
  avatarText: {
    color: COLORS.primary,
    fontSize: 17,
    fontWeight: '900'
  },
  roleBadge: {
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: RADIUS.pill,
    borderWidth: 1
  },
  roleAdmin: {
    backgroundColor: COLORS.primarySoft,
    borderColor: 'rgba(201, 255, 61, 0.35)'
  },
  roleClient: {
    backgroundColor: COLORS.accentSoft,
    borderColor: 'rgba(53, 230, 255, 0.35)'
  },
  roleText: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.8
  },
  roleTextAdmin: {
    color: COLORS.primary
  },
  roleTextClient: {
    color: COLORS.accent
  },
  deleteBtn: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.dangerSoft,
    borderWidth: 1,
    borderColor: 'rgba(255, 107, 138, 0.35)'
  },
  deleteBtnText: {
    color: COLORS.danger,
    fontSize: 10,
    fontWeight: '900'
  },
  selfText: {
    color: COLORS.textDim,
    fontSize: 10,
    fontWeight: '600'
  }
});

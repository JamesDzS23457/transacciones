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
  TextInput,
  Alert,
  useWindowDimensions
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useApp, Product, SERVICES_CONFIG } from '../context/AppContext';
import { cacheProductsLocally, getLocalProducts } from '../services/offlineStorage';
import { BRAND, COLORS, RADIUS, SHADOW } from '../constants/brand';

export default function ProductsScreen() {
  const router = useRouter();
  const { user, logout, addToCart, cart } = useApp();
  const { width } = useWindowDimensions();
  const isAdmin = user?.rol === 'admin';

  const GRID_PADDING = 18;
  const GRID_GAP = 14;
  const availableWidth = width - GRID_PADDING * 2;
  const targetCardWidth = 300;
  const numColumns = Math.max(1, Math.min(6, Math.floor(availableWidth / targetCardWidth)));
  // Ancho fijo por tarjeta: evita que la última fila se estire a todo el ancho.
  const cardWidth = (width - GRID_PADDING * 2 - GRID_GAP * (numColumns - 1)) / numColumns;

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!user) {
      router.replace('/');
    }
  }, [user]);

  const fetchProducts = async () => {
    try {
      setErrorMsg('');

      // Solo se acepta una respuesta si es un arreglo real. Así evitamos que
      // un gateway mal configurado devuelva un objeto y rompa el render.
      const fetchList = async (url: string): Promise<Product[] | null> => {
        const response = await fetch(url).catch(() => null);
        if (!response || !response.ok) return null;
        const data = await response.json().catch(() => null);
        return Array.isArray(data) ? data : null;
      };

      let data = await fetchList(`${SERVICES_CONFIG.GATEWAY_URL}/products`);
      if (!data) {
        data = await fetchList(`${SERVICES_CONFIG.PRODUCTS_URL}/products`);
      }

      if (data) {
        setProducts(data);
        await cacheProductsLocally(data);
      } else {
        console.warn('⚠️ [Offline] Cargando catálogo desde la base local...');
        const localProds = await getLocalProducts();
        if (Array.isArray(localProds) && localProds.length > 0) {
          setProducts(localProds);
        } else {
          throw new Error('No hay conexión y tampoco hay productos guardados localmente.');
        }
      }
    } catch (err: any) {
      console.warn('Error fetching products:', err);
      const localProds = await getLocalProducts();
      if (Array.isArray(localProds) && localProds.length > 0) {
        setProducts(localProds);
      } else {
        setErrorMsg('Sin conexión a internet ni productos en caché local.');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Refresca al volver al catálogo (por ejemplo, después de una compra
  // que descontó stock o después de cancelar una compra).
  useFocusEffect(
    React.useCallback(() => {
      fetchProducts();
    }, [])
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchProducts();
  };

  const totalCartCount = cart.reduce((acc, item) => acc + item.cantidad, 0);

  const filteredProducts = (Array.isArray(products) ? products : []).filter((p) =>
    p?.nombreproducto?.toLowerCase().includes(query.trim().toLowerCase())
  );

  const adjustStock = async (product: Product, delta: number) => {
    if (!user || user.rol !== 'admin') return;
    const request = async (base: string) => {
      const res = await fetch(`${base}/products/${product.id}/stock`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-user-role': 'admin'
        },
        body: JSON.stringify({ delta })
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
    } else {
      Alert.alert('Stock', 'No se pudo actualizar el stock. Intenta de nuevo.');
    }
  };

  const renderProductItem = ({ item }: { item: Product }) => (
    <View style={[styles.card, { width: cardWidth }]}>
      <View style={styles.imageWrap}>
        <Image
          source={{
            uri: item.imagenproducto || 'https://via.placeholder.com/300?text=Sin+Imagen'
          }}
          style={styles.image}
          resizeMode="cover"
        />
        <View style={styles.idBadge}>
          <Text style={styles.idText}>#{item.id}</Text>
        </View>
        <View
          style={[
            styles.stockBadge,
            typeof item.stock === 'number' && item.stock <= 0 && styles.stockBadgeEmpty
          ]}
        >
          <Text
            style={[
              styles.stockText,
              typeof item.stock === 'number' && item.stock <= 0 && styles.stockTextEmpty
            ]}
          >
            {typeof item.stock === 'number'
              ? item.stock <= 0
                ? 'AGOTADO'
                : `STOCK ${item.stock}`
              : 'STOCK —'}
          </Text>
        </View>
      </View>
      <View style={styles.cardContent}>
        <Text style={styles.productName} numberOfLines={2}>
          {item.nombreproducto}
        </Text>
        {isAdmin && (
          <View style={styles.stockControls}>
            <Text style={styles.stockControlsLabel}>AJUSTAR STOCK</Text>
            <TouchableOpacity
              style={styles.stockBtn}
              onPress={() => adjustStock(item, -1)}
              accessibilityLabel={`Disminuir stock de ${item.nombreproducto}`}
            >
              <Text style={styles.stockBtnText}>−</Text>
            </TouchableOpacity>
            <Text style={styles.stockControlValue}>
              {typeof item.stock === 'number' ? item.stock : '—'}
            </Text>
            <TouchableOpacity
              style={styles.stockBtn}
              onPress={() => adjustStock(item, 1)}
              accessibilityLabel={`Aumentar stock de ${item.nombreproducto}`}
            >
              <Text style={styles.stockBtnText}>+</Text>
            </TouchableOpacity>
          </View>
        )}
        <View style={styles.priceRow}>
          <View>
            <Text style={styles.priceLabel}>PRECIO</Text>
            <Text style={styles.productPrice}>${parseFloat(item.precio as any).toFixed(2)}</Text>
          </View>
          <TouchableOpacity
            style={[
              styles.addButton,
              typeof item.stock === 'number' && item.stock <= 0 && styles.addButtonDisabled
            ]}
            onPress={() => addToCart(item)}
            disabled={typeof item.stock === 'number' && item.stock <= 0}
            activeOpacity={0.85}
            accessibilityLabel={`Agregar ${item.nombreproducto} al carrito`}
          >
            <Text style={styles.addButtonText}>+</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View style={styles.brandRow}>
            <View style={styles.logoMark}>
              <Text style={styles.logoLetter}>J</Text>
            </View>
            <View>
              <Text style={styles.wordmark}>
                {BRAND.wordmark} <Text style={styles.wordmarkAccent}>{BRAND.wordmarkAccent}</Text>
              </Text>
              <Text style={styles.tagline}>{BRAND.tagline}</Text>
            </View>
          </View>

          <TouchableOpacity style={styles.cartButton} onPress={() => router.push('/cart')} accessibilityLabel="Abrir carrito">
            <Text style={styles.cartIcon}>🛒</Text>
            <Text style={styles.cartText}>Carrito</Text>
            {totalCartCount > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{totalCartCount}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.greetingRow}>
          <View style={styles.greetingInfo}>
            <Text style={styles.kicker}>BIENVENIDO DE NUEVO</Text>
            <Text style={styles.greeting}>Hola, {user ? user.nombre : 'Usuario'}</Text>
            <View style={styles.roleRow}>
              <Text style={styles.roleBadge}>{isAdmin ? 'ADMIN' : 'CLIENTE'}</Text>
              <Text style={styles.userEmail}>{user ? user.correo : ''}</Text>
            </View>
          </View>
          <TouchableOpacity
            style={styles.logoutButton}
            onPress={() => {
              logout();
              router.replace('/');
            }}
          >
            <Text style={styles.logoutButtonText}>Salir</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.searchRow}>
          <TextInput
            style={styles.searchInput}
            placeholder="Buscar en el catálogo..."
            placeholderTextColor={COLORS.textDim}
            value={query}
            onChangeText={setQuery}
            autoCorrect={false}
          />
          {isAdmin && (
            <TouchableOpacity
              style={styles.addProductButton}
              onPress={() => router.push('/add-product')}
              accessibilityLabel="Agregar producto"
            >
              <Text style={styles.addProductButtonText}>+</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.sectionRow}>
          <Text style={styles.sectionTitle}>CATÁLOGO</Text>
          <View style={styles.sectionRight}>
            {isAdmin && (
              <TouchableOpacity style={styles.adminChip} onPress={() => router.push('/admin' as any)}>
                <Text style={styles.adminChipText}>Panel admin</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.ordersChip} onPress={() => router.push('/my-orders')}>
              <Text style={styles.ordersChipText}>Mis compras</Text>
            </TouchableOpacity>
            <Text style={styles.countText}>{filteredProducts.length} productos</Text>
          </View>
        </View>
      </View>

      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>Cargando catálogo...</Text>
        </View>
      ) : errorMsg ? (
        <View style={styles.centerContainer}>
          <Text style={styles.errorText}>{errorMsg}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={fetchProducts}>
            <Text style={styles.retryButtonText}>Reintentar conexión</Text>
          </TouchableOpacity>
        </View>
      ) : filteredProducts.length === 0 ? (
        <View style={styles.centerContainer}>
          <Text style={styles.emptyIcon}>🛍️</Text>
          <Text style={styles.emptyText}>
            {products.length === 0
              ? 'No hay productos registrados todavía.'
              : 'No encontramos productos con ese nombre.'}
          </Text>
          {products.length === 0 && (
            <TouchableOpacity
              style={styles.createButton}
              onPress={() => router.push('/add-product')}
            >
              <Text style={styles.createButtonText}>Crear el primer producto</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <FlatList
          key={`grid-${numColumns}`}
          data={filteredProducts}
          keyExtractor={(item) => item.id.toString()}
          renderItem={renderProductItem}
          numColumns={numColumns}
          columnWrapperStyle={numColumns > 1 ? styles.row : undefined}
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
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.bg
  },
  header: {
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderSoft
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  logoMark: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center'
  },
  logoLetter: {
    color: COLORS.primaryText,
    fontSize: 19,
    fontWeight: '900'
  },
  wordmark: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 1.4
  },
  wordmarkAccent: {
    color: COLORS.primary
  },
  tagline: {
    color: COLORS.textDim,
    fontSize: 7,
    fontWeight: '800',
    letterSpacing: 2,
    marginTop: 2
  },
  cartButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.primary,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: RADIUS.pill,
    gap: 6
  },
  cartIcon: {
    fontSize: 14
  },
  cartText: {
    color: COLORS.primaryText,
    fontSize: 12,
    fontWeight: '900'
  },
  badge: {
    backgroundColor: COLORS.primaryText,
    borderRadius: RADIUS.pill,
    minWidth: 18,
    height: 18,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 5
  },
  badgeText: {
    color: COLORS.primary,
    fontSize: 10,
    fontWeight: '900'
  },
  greetingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginTop: 20
  },
  greetingInfo: {
    flex: 1
  },
  kicker: {
    color: COLORS.primary,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 2.2,
    marginBottom: 5
  },
  greeting: {
    color: COLORS.text,
    fontSize: 26,
    fontWeight: '900',
    letterSpacing: -0.8
  },
  userEmail: {
    color: COLORS.textMuted,
    fontSize: 12,
    marginTop: 3
  },
  logoutButton: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    borderColor: COLORS.border
  },
  logoutButtonText: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontWeight: '700'
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 18
  },
  searchInput: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingHorizontal: 15,
    paddingVertical: 12,
    color: COLORS.text,
    fontSize: 14
  },
  addProductButton: {
    width: 46,
    height: 46,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.primarySoft,
    borderWidth: 1,
    borderColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center'
  },
  addProductButtonText: {
    color: COLORS.primary,
    fontSize: 22,
    fontWeight: '800',
    marginTop: -2
  },
  sectionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 18
  },
  sectionTitle: {
    color: COLORS.text,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 2
  },
  sectionRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  ordersChip: {
    backgroundColor: COLORS.surfaceAlt,
    borderRadius: RADIUS.pill,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: COLORS.borderSoft
  },
  ordersChipText: {
    color: COLORS.accent,
    fontSize: 11,
    fontWeight: '700'
  },
  adminChip: {
    backgroundColor: COLORS.primarySoft,
    borderRadius: RADIUS.pill,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: 'rgba(201, 255, 61, 0.35)'
  },
  adminChipText: {
    color: COLORS.primary,
    fontSize: 11,
    fontWeight: '900'
  },
  countText: {
    color: COLORS.textDim,
    fontSize: 11,
    fontWeight: '600'
  },
  listContent: {
    padding: 18,
    paddingBottom: 32
  },
  row: {
    gap: 14,
    marginBottom: 14
  },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.borderSoft,
    marginBottom: 14,
    ...SHADOW.soft
  },
  imageWrap: {
    position: 'relative'
  },
  image: {
    width: '100%',
    height: 190,
    backgroundColor: COLORS.surfaceAlt
  },
  idBadge: {
    position: 'absolute',
    top: 10,
    left: 10,
    backgroundColor: 'rgba(5, 7, 13, 0.72)',
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: RADIUS.pill
  },
  idText: {
    color: COLORS.accent,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5
  },
  cardContent: {
    padding: 14
  },
  productName: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.text,
    minHeight: 40,
    lineHeight: 20
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginTop: 10
  },
  priceLabel: {
    color: COLORS.textDim,
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 1.6,
    marginBottom: 2
  },
  productPrice: {
    fontSize: 20,
    fontWeight: '900',
    color: COLORS.primary,
    letterSpacing: -0.5
  },
  addButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center'
  },
  addButtonDisabled: {
    backgroundColor: COLORS.surfaceHigh,
    opacity: 0.5
  },
  stockBadge: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: COLORS.successSoft,
    borderWidth: 1,
    borderColor: 'rgba(62, 230, 161, 0.4)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: RADIUS.pill
  },
  stockBadgeEmpty: {
    backgroundColor: COLORS.dangerSoft,
    borderColor: 'rgba(255, 107, 138, 0.4)'
  },
  stockText: {
    color: COLORS.success,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.5
  },
  stockTextEmpty: {
    color: COLORS.danger
  },
  stockControls: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 8
  },
  stockControlsLabel: {
    color: COLORS.textDim,
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 1.2,
    flex: 1
  },
  stockBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: COLORS.surfaceAlt,
    borderWidth: 1,
    borderColor: COLORS.border,
    justifyContent: 'center',
    alignItems: 'center'
  },
  stockBtnText: {
    color: COLORS.primary,
    fontSize: 14,
    fontWeight: '900'
  },
  stockControlValue: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: '800',
    minWidth: 18,
    textAlign: 'center'
  },
  roleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4
  },
  roleBadge: {
    color: COLORS.primary,
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 1,
    backgroundColor: COLORS.primarySoft,
    borderWidth: 1,
    borderColor: 'rgba(201, 255, 61, 0.35)',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: RADIUS.pill,
    overflow: 'hidden'
  },
  addButtonText: {
    color: COLORS.primaryText,
    fontSize: 22,
    fontWeight: '900',
    marginTop: -2
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
  errorText: {
    color: COLORS.danger,
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 14
  },
  emptyIcon: {
    fontSize: 44,
    marginBottom: 14
  },
  emptyText: {
    color: COLORS.textMuted,
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 18,
    lineHeight: 20
  },
  retryButton: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: RADIUS.md
  },
  retryButtonText: {
    color: COLORS.primaryText,
    fontWeight: '800',
    fontSize: 13
  },
  createButton: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: RADIUS.md
  },
  createButtonText: {
    color: COLORS.primaryText,
    fontWeight: '800',
    fontSize: 13
  }
});

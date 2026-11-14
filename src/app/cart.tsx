import React, { useState } from 'react';
import {
  View,
  Text,
  FlatList,
  Image,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Platform,
  Modal,
  ScrollView
} from 'react-native';
import { useRouter } from 'expo-router';
import { useNetInfo } from '@react-native-community/netinfo';
import * as Print from 'expo-print';
import { useApp, CartItem } from '../context/AppContext';
import { savePurchaseOffline, markAsSynced, removeOfflinePurchase } from '../services/offlineStorage';
import { isOnline, sendCheckout } from '../services/syncService';
import { BRAND, COLORS, RADIUS, SHADOW } from '../constants/brand';

interface InvoiceData {
  numero_factura: string;
  fecha: string;
  usuario: {
    nombre: string;
    correo: string;
  };
  items: CartItem[];
  subtotal: number;
  iva: number;
  total: number;
  /** true cuando la compra quedó pendiente en SQLite (sin internet). */
  pendienteSync?: boolean;
}

export default function CartScreen() {
  const router = useRouter();
  const { user, cart, removeFromCart, updateQuantity, clearCart, restoreCart, calculation, isCalculating } = useApp();
  const [processingOrder, setProcessingOrder] = useState<boolean>(false);
  const [invoice, setInvoice] = useState<InvoiceData | null>(null);
  const [showModal, setShowModal] = useState<boolean>(false);

  // Solo se considera offline si el dispositivo lo dice explícitamente.
  const netInfo = useNetInfo();
  const offline = netInfo.isConnected === false;

  React.useEffect(() => {
    if (!user) {
      router.replace('/');
    }
  }, [user]);

  // Generador de HTML para el PDF y la impresión
  const generateInvoiceHtml = (data: InvoiceData) => {
    const itemsRows = data.items
      .map(
        (it) => `
        <tr>
          <td style="padding: 10px; border-bottom: 1px solid #e2e8f0;">${it.nombreproducto}</td>
          <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; text-align: center;">${it.cantidad}</td>
          <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; text-align: right;">$${Number(it.precio).toFixed(2)}</td>
          <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; text-align: right;">$${(Number(it.precio) * it.cantidad).toFixed(2)}</td>
        </tr>
      `
      )
      .join('');

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>Factura ${data.numero_factura}</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #0b1220; margin: 40px; }
            .header { display: flex; justify-content: space-between; border-bottom: 2px solid #0b1220; padding-bottom: 20px; }
            .company { font-size: 24px; font-weight: 800; letter-spacing: 1px; }
            .company span { color: #6f9c00; }
            .invoice-title { font-size: 18px; font-weight: 700; color: #475569; text-align: right; letter-spacing: 1px; }
            .meta { margin-top: 24px; display: flex; justify-content: space-between; font-size: 14px; }
            table { width: 100%; border-collapse: collapse; margin-top: 30px; }
            th { background-color: #f8fafc; padding: 12px 10px; text-align: left; font-size: 13px; border-bottom: 2px solid #cbd5e1; }
            .totals { margin-top: 30px; margin-left: auto; width: 300px; font-size: 14px; }
            .totals-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #e2e8f0; }
            .grand-total { font-size: 18px; font-weight: 800; color: #4d7300; border-top: 2px solid #0b1220; border-bottom: none; }
            .footer { margin-top: 50px; text-align: center; color: #94a3b8; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="header">
            <div>
              <div class="company">JAMES <span>STORE</span></div>
              <div style="color: #64748b; font-size: 12px; margin-top: 4px; letter-spacing: 1px;">PREMIUM TECH MARKETPLACE</div>
            </div>
            <div>
              <div class="invoice-title">FACTURA</div>
              <div style="font-weight: 700; margin-top: 4px;">${data.numero_factura}</div>
            </div>
          </div>

          <div class="meta">
            <div>
              <strong>Cliente:</strong><br>
              ${data.usuario.nombre}<br>
              ${data.usuario.correo}
            </div>
            <div style="text-align: right;">
              <strong>Fecha de emisión:</strong><br>
              ${data.fecha}
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th>Producto</th>
                <th style="text-align: center;">Cant.</th>
                <th style="text-align: right;">Precio unit.</th>
                <th style="text-align: right;">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              ${itemsRows}
            </tbody>
          </table>

          <div class="totals">
            <div class="totals-row">
              <span>Subtotal:</span>
              <span>$${data.subtotal.toFixed(2)}</span>
            </div>
            <div class="totals-row">
              <span>IVA (19%):</span>
              <span>$${data.iva.toFixed(2)}</span>
            </div>
            <div class="totals-row grand-total">
              <span>Total pagado:</span>
              <span>$${data.total.toFixed(2)}</span>
            </div>
          </div>

          <div class="footer">
            ${data.pendienteSync
              ? 'Compra guardada localmente. Se sincronizará con la nube cuando vuelva la conexión.'
              : 'Gracias por tu compra. Esta factura fue registrada en la nube.'}
          </div>
        </body>
      </html>
    `;
  };

  const handlePrintOrPdf = async () => {
    if (!invoice) return;

    const html = generateInvoiceHtml(invoice);

    if (Platform.OS === 'web') {
      const iframe = document.createElement('iframe');
      iframe.style.position = 'fixed';
      iframe.style.right = '0';
      iframe.style.bottom = '0';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = '0';
      document.body.appendChild(iframe);

      const doc = iframe.contentWindow?.document || iframe.contentDocument;
      if (doc) {
        doc.open();
        doc.write(html);
        doc.close();

        setTimeout(() => {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
          setTimeout(() => {
            document.body.removeChild(iframe);
          }, 1000);
        }, 250);
      }
    } else {
      try {
        await Print.printAsync({ html });
      } catch (e: any) {
        console.warn('Error imprimiendo:', e);
      }
    }
  };

  const handleCheckout = async () => {
    if (processingOrder) return;
    if (cart.length === 0) return;

    if (!user) {
      const msg = 'Debes iniciar sesión para confirmar tu compra';
      if (Platform.OS !== 'web') Alert.alert('Atención', msg);
      else alert(msg);
      router.replace('/');
      return;
    }

    setProcessingOrder(true);
    try {
      // 1. Generar número de factura único
      const randomSuffix = Math.floor(1000 + Math.random() * 9000);
      const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const numFactura = `FAC-${dateStr}-${randomSuffix}`;

      const subtotalVal =
        calculation?.subtotal || cart.reduce((acc, it) => acc + Number(it.precio) * it.cantidad, 0);
      const ivaVal = calculation?.iva || +(subtotalVal * 0.19).toFixed(2);
      const totalVal = calculation?.total || +(subtotalVal + ivaVal).toFixed(2);
      const currentCartItems = [...cart];

      // 2. Guardar primero en la base local: si falla, el carrito NO se vacía.
      const localId = await savePurchaseOffline({
        usuario_id: user.id,
        numero_factura: numFactura,
        items_json: JSON.stringify(currentCartItems),
        subtotal: subtotalVal,
        iva: ivaVal,
        total: totalVal
      });

      // 3. La compra ya está a salvo localmente: limpiar el carrito.
      clearCart();

      // 4. Solo intentar la nube si hay conexión.
      const online = await isOnline();
      const result = online
        ? await sendCheckout({
            usuario_id: user.id,
            items: currentCartItems,
            numero_factura: numFactura
          })
        : { ok: false, status: 0 as number, error: 'Sin conexión' };
      const synced = result.ok;

      if (synced) {
        await markAsSynced(localId);
        console.log('🌐 [Red] Compra guardada localmente y sincronizada con Neon.');
      } else if (online && result.status >= 400 && result.status < 500) {
        // El servidor rechazó la compra (por ejemplo, stock insuficiente).
        // Se elimina la copia local y se devuelve el carrito al usuario.
        await removeOfflinePurchase(localId);
        restoreCart(currentCartItems);
        const msg = result.error || 'No se pudo completar la compra.';
        if (Platform.OS !== 'web') Alert.alert('Compra no realizada', msg);
        else alert(msg);
        return;
      } else {
        console.warn(`📴 [Offline] Compra pendiente en la base local: ${result.error || 'sin conexión'}`);
      }

      // 5. Factura para visualizar / imprimir
      const invoiceGenerated: InvoiceData = {
        numero_factura: numFactura,
        fecha: new Date().toLocaleString(),
        usuario: {
          nombre: user.nombre,
          correo: user.correo
        },
        items: currentCartItems,
        subtotal: subtotalVal,
        iva: ivaVal,
        total: totalVal,
        pendienteSync: !synced
      };

      setInvoice(invoiceGenerated);
      setShowModal(true);

      const successNotice = synced
        ? '✅ Compra registrada y sincronizada con la nube.'
        : '📦 Compra guardada en la base local.\nSe sincronizará automáticamente cuando vuelva el internet.';
      if (Platform.OS !== 'web') {
        Alert.alert(synced ? 'Éxito' : 'Guardada offline', successNotice);
      } else {
        console.log(successNotice);
      }
    } catch (err: any) {
      console.error('Error al realizar checkout:', err);
      const errorMsg = err.message || 'No se pudo conectar con el microservicio de compras';
      if (Platform.OS !== 'web') {
        Alert.alert('Error', errorMsg);
      } else {
        alert(errorMsg);
      }
    } finally {
      setProcessingOrder(false);
    }
  };

  const renderCartItem = ({ item }: { item: CartItem }) => (
    <View style={styles.cartCard}>
      <Image
        source={{ uri: item.imagenproducto || 'https://via.placeholder.com/150' }}
        style={styles.itemImage}
        resizeMode="cover"
      />
      <View style={styles.itemInfo}>
        <Text style={styles.itemName} numberOfLines={1}>
          {item.nombreproducto}
        </Text>
        <Text style={styles.itemPrice}>
          ${parseFloat(item.precio as any).toFixed(2)} c/u
        </Text>

        <View style={styles.controlsRow}>
          <View style={styles.qtyContainer}>
            <TouchableOpacity
              style={styles.qtyBtn}
              onPress={() => updateQuantity(item.id, -1)}
            >
              <Text style={styles.qtyBtnText}>−</Text>
            </TouchableOpacity>
            <Text style={styles.qtyText}>{item.cantidad}</Text>
            <TouchableOpacity
              style={styles.qtyBtn}
              onPress={() => updateQuantity(item.id, 1)}
            >
              <Text style={styles.qtyBtnText}>+</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            onPress={() => removeFromCart(item.id)}
            style={styles.deleteBtn}
          >
            <Text style={styles.deleteBtnText}>Quitar</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      {cart.length === 0 ? (
        <View style={styles.emptyContainer}>
          <View style={styles.emptyCircle}>
            <Text style={styles.emptyIcon}>🛒</Text>
          </View>
          <Text style={styles.emptyTitle}>Tu carrito está vacío</Text>
          <Text style={styles.emptySubtitle}>
            Agrega productos desde el catálogo para verlos aquí.
          </Text>
          <TouchableOpacity
            style={styles.browseButton}
            onPress={() => router.back()}
          >
            <Text style={styles.browseButtonText}>Ver catálogo</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          {offline && (
            <View style={styles.offlineBanner}>
              <Text style={styles.offlineBannerTitle}>MODO OFFLINE</Text>
              <Text style={styles.offlineBannerText}>
                Tu compra se guardará en el dispositivo y se subirá automáticamente al volver internet.
              </Text>
            </View>
          )}

          <FlatList
            data={cart}
            keyExtractor={(item) => item.id.toString()}
            renderItem={renderCartItem}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
          />

          <View style={styles.summaryCard}>
            <View style={styles.serviceHeader}>
              <Text style={styles.serviceTag}>RESUMEN DE COMPRA</Text>
              {(isCalculating || processingOrder) && (
                <ActivityIndicator size="small" color={COLORS.primary} />
              )}
            </View>

            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Subtotal ({calculation?.totalItems || 0} arts.)</Text>
              <Text style={styles.summaryValue}>${calculation?.subtotal.toFixed(2) || '0.00'}</Text>
            </View>

            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>IVA ({calculation?.ivaPercentage || '19%'})</Text>
              <Text style={styles.summaryValue}>${calculation?.iva.toFixed(2) || '0.00'}</Text>
            </View>

            <View style={styles.divider} />

            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Total a pagar</Text>
              <Text style={styles.totalValue}>${calculation?.total.toFixed(2) || '0.00'}</Text>
            </View>

            <TouchableOpacity
              style={[styles.checkoutBtn, (isCalculating || processingOrder) && styles.btnDisabled]}
              onPress={handleCheckout}
              disabled={isCalculating || processingOrder}
              activeOpacity={0.85}
            >
              {processingOrder ? (
                <ActivityIndicator color={COLORS.primaryText} />
              ) : (
                <Text style={styles.checkoutBtnText}>Confirmar compra</Text>
              )}
            </TouchableOpacity>
          </View>
        </>
      )}

      {/* Modal factura */}
      <Modal
        visible={showModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => {
          setShowModal(false);
          router.replace('/products');
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.invoiceModalCard}>
            <ScrollView contentContainerStyle={styles.invoiceScroll} showsVerticalScrollIndicator={false}>
              <View style={styles.invoiceHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.invoiceStoreName}>
                    {BRAND.wordmark} <Text style={styles.invoiceStoreAccent}>{BRAND.wordmarkAccent}</Text>
                  </Text>
                  <Text style={styles.invoiceStoreSub}>FACTURA DE VENTA</Text>
                </View>
                <View style={styles.invoiceNumberBox}>
                  <Text style={styles.invoiceNumberLabel}>FACTURA N°</Text>
                  <Text style={styles.invoiceNumber}>{invoice?.numero_factura}</Text>
                  <View
                    style={[
                      styles.syncBadge,
                      invoice?.pendienteSync ? styles.syncBadgePending : styles.syncBadgeOk
                    ]}
                  >
                    <Text
                      style={[
                        styles.syncBadgeText,
                        invoice?.pendienteSync ? styles.syncBadgeTextPending : styles.syncBadgeTextOk
                      ]}
                    >
                      {invoice?.pendienteSync ? 'GUARDADA OFFLINE' : 'SINCRONIZADA'}
                    </Text>
                  </View>
                </View>
              </View>

              <View style={styles.invoiceClientBox}>
                <Text style={styles.clientLabel}>
                  Cliente: <Text style={styles.clientVal}>{invoice?.usuario.nombre}</Text>
                </Text>
                <Text style={styles.clientLabel}>
                  Correo: <Text style={styles.clientVal}>{invoice?.usuario.correo}</Text>
                </Text>
                <Text style={styles.clientLabel}>
                  Fecha: <Text style={styles.clientVal}>{invoice?.fecha}</Text>
                </Text>
              </View>

              <View style={styles.tableHeader}>
                <Text style={[styles.tableHeadText, { flex: 2 }]}>PRODUCTO</Text>
                <Text style={[styles.tableHeadText, { flex: 0.8, textAlign: 'center' }]}>CANT.</Text>
                <Text style={[styles.tableHeadText, { flex: 1, textAlign: 'right' }]}>PRECIO</Text>
                <Text style={[styles.tableHeadText, { flex: 1, textAlign: 'right' }]}>TOTAL</Text>
              </View>

              {invoice?.items.map((it, idx) => (
                <View key={idx} style={styles.tableRow}>
                  <Text style={[styles.tableCellText, { flex: 2 }]} numberOfLines={1}>
                    {it.nombreproducto}
                  </Text>
                  <Text style={[styles.tableCellText, { flex: 0.8, textAlign: 'center' }]}>{it.cantidad}</Text>
                  <Text style={[styles.tableCellText, { flex: 1, textAlign: 'right' }]}>
                    ${Number(it.precio).toFixed(2)}
                  </Text>
                  <Text style={[styles.tableCellText, { flex: 1, textAlign: 'right', fontWeight: '800' }]}>
                    ${(Number(it.precio) * it.cantidad).toFixed(2)}
                  </Text>
                </View>
              ))}

              <View style={styles.invoiceTotals}>
                <View style={styles.invoiceTotalRow}>
                  <Text style={styles.subLabel}>Subtotal</Text>
                  <Text style={styles.subVal}>${invoice?.subtotal.toFixed(2)}</Text>
                </View>
                <View style={styles.invoiceTotalRow}>
                  <Text style={styles.subLabel}>IVA (19%)</Text>
                  <Text style={styles.subVal}>${invoice?.iva.toFixed(2)}</Text>
                </View>
                <View style={[styles.invoiceTotalRow, styles.grandTotalBorder]}>
                  <Text style={styles.grandLabel}>Total facturado</Text>
                  <Text style={styles.grandVal}>${invoice?.total.toFixed(2)}</Text>
                </View>
              </View>

              <View style={styles.actionRow}>
                <TouchableOpacity style={styles.printBtn} onPress={handlePrintOrPdf}>
                  <Text style={styles.printBtnText}>Imprimir / Guardar PDF</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.closeModalBtn}
                  onPress={() => {
                    setShowModal(false);
                    router.replace('/products');
                  }}
                >
                  <Text style={styles.closeModalBtnText}>Cerrar y volver al catálogo</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg
  },
  listContent: {
    padding: 16,
    paddingBottom: 22
  },
  cartCard: {
    flexDirection: 'row',
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.borderSoft,
    alignItems: 'center'
  },
  itemImage: {
    width: 76,
    height: 76,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.surfaceAlt
  },
  itemInfo: {
    flex: 1,
    marginLeft: 14
  },
  itemName: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.text
  },
  itemPrice: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 3
  },
  controlsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10
  },
  qtyContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surfaceAlt,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    borderColor: COLORS.border
  },
  qtyBtn: {
    width: 30,
    height: 30,
    justifyContent: 'center',
    alignItems: 'center'
  },
  qtyBtnText: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.primary
  },
  qtyText: {
    fontSize: 13,
    fontWeight: '800',
    color: COLORS.text,
    paddingHorizontal: 6
  },
  deleteBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.dangerSoft
  },
  deleteBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.danger
  },
  summaryCard: {
    backgroundColor: COLORS.surface,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    padding: 18,
    paddingBottom: Platform.OS === 'ios' ? 28 : 18
  },
  serviceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14
  },
  serviceTag: {
    color: COLORS.primary,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 2
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8
  },
  summaryLabel: {
    fontSize: 13,
    color: COLORS.textMuted
  },
  summaryValue: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.text
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.borderSoft,
    marginVertical: 12
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16
  },
  totalLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.text
  },
  totalValue: {
    fontSize: 26,
    fontWeight: '900',
    color: COLORS.primary,
    letterSpacing: -0.8
  },
  checkoutBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.md,
    paddingVertical: 16,
    alignItems: 'center'
  },
  checkoutBtnText: {
    color: COLORS.primaryText,
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 0.2
  },
  btnDisabled: {
    opacity: 0.6
  },
  offlineBanner: {
    backgroundColor: COLORS.warningSoft,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 200, 87, 0.35)',
    paddingHorizontal: 16,
    paddingVertical: 11
  },
  offlineBannerTitle: {
    color: COLORS.warning,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.8,
    marginBottom: 3
  },
  offlineBannerText: {
    color: COLORS.textMuted,
    fontSize: 12,
    lineHeight: 17
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 28
  },
  emptyCircle: {
    width: 92,
    height: 92,
    borderRadius: 46,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 18
  },
  emptyIcon: {
    fontSize: 38
  },
  emptyTitle: {
    fontSize: 23,
    fontWeight: '900',
    color: COLORS.text,
    letterSpacing: -0.5
  },
  emptySubtitle: {
    fontSize: 13,
    color: COLORS.textMuted,
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 22,
    maxWidth: 300,
    lineHeight: 20
  },
  browseButton: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 22,
    paddingVertical: 13,
    borderRadius: RADIUS.md
  },
  browseButtonText: {
    color: COLORS.primaryText,
    fontWeight: '900',
    fontSize: 14
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: COLORS.overlay,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16
  },
  invoiceModalCard: {
    width: '100%',
    maxWidth: 560,
    maxHeight: '92%',
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
    ...SHADOW.card
  },
  invoiceScroll: {
    padding: 22
  },
  invoiceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 10
  },
  invoiceStoreName: {
    color: COLORS.text,
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 1.4
  },
  invoiceStoreAccent: {
    color: COLORS.primary
  },
  invoiceStoreSub: {
    color: COLORS.textDim,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 2,
    marginTop: 4
  },
  invoiceNumberBox: {
    alignItems: 'flex-end',
    backgroundColor: COLORS.surfaceAlt,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingHorizontal: 12,
    paddingVertical: 9
  },
  invoiceNumberLabel: {
    fontSize: 8,
    color: COLORS.textDim,
    fontWeight: '800',
    letterSpacing: 1.4
  },
  invoiceNumber: {
    fontSize: 12,
    fontWeight: '800',
    color: COLORS.text,
    marginTop: 2
  },
  syncBadge: {
    marginTop: 7,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: RADIUS.pill
  },
  syncBadgePending: {
    backgroundColor: COLORS.warningSoft
  },
  syncBadgeOk: {
    backgroundColor: COLORS.successSoft
  },
  syncBadgeText: {
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0.6
  },
  syncBadgeTextPending: {
    color: COLORS.warning
  },
  syncBadgeTextOk: {
    color: COLORS.success
  },
  invoiceClientBox: {
    backgroundColor: COLORS.surfaceAlt,
    padding: 14,
    borderRadius: RADIUS.md,
    marginVertical: 18,
    gap: 5,
    borderWidth: 1,
    borderColor: COLORS.borderSoft
  },
  clientLabel: {
    fontSize: 12,
    color: COLORS.textMuted
  },
  clientVal: {
    fontWeight: '700',
    color: COLORS.text
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: COLORS.surfaceAlt,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: RADIUS.sm,
    marginBottom: 8
  },
  tableHeadText: {
    fontSize: 8,
    fontWeight: '900',
    color: COLORS.textDim,
    letterSpacing: 1
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderSoft
  },
  tableCellText: {
    fontSize: 12,
    color: COLORS.text
  },
  invoiceTotals: {
    marginTop: 18,
    gap: 6
  },
  invoiceTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between'
  },
  subLabel: {
    fontSize: 12,
    color: COLORS.textMuted
  },
  subVal: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.text
  },
  grandTotalBorder: {
    marginTop: 6,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: COLORS.border
  },
  grandLabel: {
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.text
  },
  grandVal: {
    fontSize: 20,
    fontWeight: '900',
    color: COLORS.primary
  },
  actionRow: {
    marginTop: 22,
    gap: 10
  },
  printBtn: {
    backgroundColor: COLORS.primary,
    paddingVertical: 14,
    borderRadius: RADIUS.md,
    alignItems: 'center'
  },
  printBtnText: {
    color: COLORS.primaryText,
    fontWeight: '900',
    fontSize: 13
  },
  closeModalBtn: {
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md
  },
  closeModalBtnText: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: '700'
  }
});

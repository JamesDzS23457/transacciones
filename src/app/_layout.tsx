import React from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Stack } from 'expo-router';
import { AppProvider, useApp } from '../context/AppContext';

/**
 * Modal que aparece cuando la app recupera internet y sincroniza las
 * compras que quedaron pendientes en SQLite. Vive dentro del AppProvider
 * para poder leer el contador de sincronización.
 */
function SyncNoticeModal() {
  const { syncNotice, dismissSyncNotice } = useApp();

  return (
    <Modal
      visible={syncNotice.visible}
      transparent
      animationType="fade"
      onRequestClose={dismissSyncNotice}
    >
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.icon}>✅</Text>
          <Text style={styles.title}>Productos sincronizados</Text>
          <Text style={styles.message}>
            {syncNotice.count === 1
              ? 'Se sincronizó 1 compra pendiente con la nube.'
              : `Se sincronizaron ${syncNotice.count} compras pendientes con la nube.`}
          </Text>
          <TouchableOpacity style={styles.button} onPress={dismissSyncNotice}>
            <Text style={styles.buttonText}>Aceptar</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

export default function RootLayout() {
  return (
    <AppProvider>
      <SyncNoticeModal />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: '#ffffff' },
          headerTintColor: '#111827',
          headerTitleStyle: { fontWeight: '700' },
          headerShadowVisible: false,
          contentStyle: { backgroundColor: '#f9fafb' }
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="products" options={{ title: 'Catálogo de Productos' }} />
        <Stack.Screen name="cart" options={{ title: 'Mi Carrito' }} />
        <Stack.Screen name="my-orders" options={{ title: 'Mis Compras' }} />
        <Stack.Screen name="add-product" options={{ title: 'Nuevo Producto' }} />
      </Stack>
    </AppProvider>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24
  },
  card: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 28,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 24,
    elevation: 10
  },
  icon: {
    fontSize: 44,
    marginBottom: 12
  },
  title: {
    fontSize: 19,
    fontWeight: '800',
    color: '#0f172a',
    textAlign: 'center'
  },
  message: {
    fontSize: 14,
    color: '#475569',
    textAlign: 'center',
    marginTop: 10,
    lineHeight: 20
  },
  button: {
    marginTop: 22,
    backgroundColor: '#059669',
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 10,
    width: '100%',
    alignItems: 'center'
  },
  buttonText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 15
  }
});

import React from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AppProvider, useApp } from '../context/AppContext';
import { BRAND, COLORS, RADIUS, SHADOW } from '../constants/brand';

/**
 * Modal que aparece cuando la app recupera internet y sincroniza las
 * compras que quedaron pendientes en SQLite.
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
          <View style={styles.checkCircle}>
            <Text style={styles.check}>✓</Text>
          </View>
          <Text style={styles.eyebrow}>SINCRONIZACIÓN COMPLETA</Text>
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
      <StatusBar style="light" />
      <SyncNoticeModal />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: COLORS.bg },
          headerTintColor: COLORS.primary,
          headerTitleStyle: { fontWeight: '800', color: COLORS.text },
          headerShadowVisible: false,
          headerBackButtonDisplayMode: 'minimal',
          contentStyle: { backgroundColor: COLORS.bg }
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="products" options={{ headerShown: false }} />
        <Stack.Screen name="cart" options={{ title: 'MI CARRITO' }} />
        <Stack.Screen name="my-orders" options={{ title: 'MIS COMPRAS' }} />
        <Stack.Screen name="add-product" options={{ title: 'NUEVO PRODUCTO' }} />
        <Stack.Screen name="admin" options={{ title: 'PANEL ADMIN' }} />
      </Stack>
    </AppProvider>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: COLORS.overlay,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24
  },
  card: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 28,
    alignItems: 'center',
    ...SHADOW.card
  },
  checkCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: COLORS.primarySoft,
    borderWidth: 1,
    borderColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16
  },
  check: {
    color: COLORS.primary,
    fontSize: 30,
    fontWeight: '900'
  },
  eyebrow: {
    color: COLORS.primary,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 2,
    marginBottom: 8
  },
  title: {
    fontSize: 22,
    fontWeight: '900',
    color: COLORS.text,
    textAlign: 'center',
    letterSpacing: -0.4
  },
  message: {
    fontSize: 14,
    color: COLORS.textMuted,
    textAlign: 'center',
    marginTop: 10,
    lineHeight: 21
  },
  button: {
    marginTop: 24,
    backgroundColor: COLORS.primary,
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: RADIUS.md,
    width: '100%',
    alignItems: 'center'
  },
  buttonText: {
    color: COLORS.primaryText,
    fontWeight: '900',
    fontSize: 15,
    letterSpacing: 0.2
  }
});

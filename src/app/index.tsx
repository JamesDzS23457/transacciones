import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert
} from 'react-native';
import { useRouter } from 'expo-router';
import { useApp, SERVICES_CONFIG } from '../context/AppContext';
import { authenticateOffline, DEFAULT_OFFLINE_USER } from '../services/offlineStorage';
import { BRAND, COLORS, RADIUS, SHADOW } from '../constants/brand';

// La app tiene un único usuario administrador (james). El registro queda
// deshabilitado desde la interfaz; cámbialo a true si necesitas crear más usuarios.
const ALLOW_REGISTRATION = true;

export default function LoginScreen() {
  const router = useRouter();
  const { login } = useApp();

  const [isRegistering, setIsRegistering] = useState(false);
  const [nombre, setNombre] = useState('');
  const [correo, setCorreo] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleSubmit = async () => {
    setErrorMsg('');
    if (!correo.trim() || !contrasena.trim()) {
      setErrorMsg('Por favor completa todos los campos requeridos');
      return;
    }

    if (isRegistering && !nombre.trim()) {
      setErrorMsg('El nombre es obligatorio para registrarse');
      return;
    }

    setLoading(true);
    const authPath = isRegistering ? 'register' : 'login';
    const payload = isRegistering ? { nombre, correo, contrasena } : { correo, contrasena };

    try {
      // 1. Si no es registro, verificar si son credenciales de emergencia offline (james)
      if (!isRegistering) {
        const isDefaultOfflineUser =
          correo.trim().toLowerCase() === DEFAULT_OFFLINE_USER.correo.toLowerCase() &&
          contrasena.trim() === DEFAULT_OFFLINE_USER.contrasena;

        // Intentar microservicio primero, pero si falla o no hay internet, permitir ingreso offline
        try {
          let response: Response | null = await fetch(`${SERVICES_CONFIG.GATEWAY_URL}/auth/${authPath}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          }).catch(() => null);

          if (!response || !response.ok) {
            response = await fetch(`${SERVICES_CONFIG.AUTH_URL}/${authPath}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload)
            }).catch(() => null);
          }

          if (response && response.ok) {
            const data = await response.json();
            login(data.user, data.token);
            router.replace('/products');
            return;
          }
        } catch {
          // Microservicio caído o sin internet
        }

        // 2. Si falló el microservicio o no hay internet, validar con usuario local en SQLite/Storage
        const offlineAuth = await authenticateOffline(correo, contrasena);
        if (offlineAuth) {
          console.log('🔑 [Auth] Ingreso exitoso en modo OFFLINE con usuario local/SQLite');
          login(offlineAuth.user, offlineAuth.token);
          router.replace('/products');
          return;
        }

        if (isDefaultOfflineUser) {
          login(
            { id: DEFAULT_OFFLINE_USER.id, nombre: DEFAULT_OFFLINE_USER.nombre, correo: DEFAULT_OFFLINE_USER.correo },
            'offline_token_admin'
          );
          router.replace('/products');
          return;
        }

        throw new Error('No se pudo conectar al servidor y las credenciales no coinciden con un usuario local offline.');
      }

      // Proceso normal de registro en el servidor
      let response: Response | null = await fetch(`${SERVICES_CONFIG.GATEWAY_URL}/auth/${authPath}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }).catch(() => null);

      if (!response || !response.ok) {
        response = await fetch(`${SERVICES_CONFIG.AUTH_URL}/${authPath}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      }

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Ocurrió un error en la solicitud');
      }

      login(data.user, data.token);
      router.replace('/products');
    } catch (err: any) {
      console.warn('Fallo de red o autenticación:', err);
      const msg = err.message || 'No se pudo conectar al microservicio de autenticación';
      setErrorMsg(msg);
      if (Platform.OS !== 'web') {
        Alert.alert('Atención', msg);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.root}>
      {/* Glows decorativos para el look premium */}
      <View style={styles.glowLime} />
      <View style={styles.glowCyan} />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
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

          <View style={styles.hero}>
            <Text style={styles.kicker}>BIENVENIDO</Text>
            <Text style={styles.heroTitle}>Tu próxima compra empieza aquí.</Text>
            <Text style={styles.heroSub}>
              Catálogo curado, checkout rápido y modo offline para que nunca pierdas una compra.
            </Text>
          </View>

          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>
                {isRegistering ? 'Crear cuenta' : 'Iniciar sesión'}
              </Text>
              <Text style={styles.cardSub}>
                {isRegistering
                  ? 'Regístrate para comprar y gestionar productos'
                  : 'Ingresa con tu usuario y contraseña'}
              </Text>
            </View>

            {errorMsg ? (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{errorMsg}</Text>
              </View>
            ) : null}

            {isRegistering && (
              <View style={styles.inputGroup}>
                <Text style={styles.label}>NOMBRE COMPLETO</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Ej. Juan Pérez"
                  placeholderTextColor={COLORS.textDim}
                  value={nombre}
                  onChangeText={setNombre}
                  autoCapitalize="words"
                />
              </View>
            )}

            <View style={styles.inputGroup}>
              <Text style={styles.label}>USUARIO O CORREO</Text>
              <TextInput
                style={styles.input}
                placeholder="james"
                placeholderTextColor={COLORS.textDim}
                value={correo}
                onChangeText={setCorreo}
                keyboardType="default"
                autoCapitalize="none"
                autoComplete="username"
                autoCorrect={false}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>CONTRASEÑA</Text>
              <TextInput
                style={styles.input}
                placeholder="••••••••"
                placeholderTextColor={COLORS.textDim}
                value={contrasena}
                onChangeText={setContrasena}
                secureTextEntry
                autoComplete="off"
                autoCorrect={false}
              />
            </View>

            <TouchableOpacity
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={handleSubmit}
              disabled={loading}
              activeOpacity={0.85}
            >
              {loading ? (
                <ActivityIndicator color={COLORS.primaryText} />
              ) : (
                <Text style={styles.buttonText}>
                  {isRegistering ? 'Crear cuenta' : 'Entrar a la tienda'}
                </Text>
              )}
            </TouchableOpacity>

            <View style={styles.offlineHint}>
              <View style={styles.hintDot} />
              <Text style={styles.hintText}>Acceso offline disponible</Text>
            </View>

            {ALLOW_REGISTRATION && (
              <TouchableOpacity
                style={styles.switchButton}
                onPress={() => {
                  setIsRegistering(!isRegistering);
                  setErrorMsg('');
                }}
              >
                <Text style={styles.switchText}>
                  {isRegistering
                    ? '¿Ya tienes una cuenta? Inicia sesión'
                    : '¿No tienes cuenta? Regístrate aquí'}
                </Text>
              </TouchableOpacity>
            )}
          </View>

          <Text style={styles.footer}>
            {BRAND.name} · {new Date().getFullYear()}
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.bg,
    overflow: 'hidden'
  },
  flex: {
    flex: 1
  },
  glowLime: {
    position: 'absolute',
    top: -160,
    right: -120,
    width: 340,
    height: 340,
    borderRadius: 170,
    backgroundColor: 'rgba(201, 255, 61, 0.10)'
  },
  glowCyan: {
    position: 'absolute',
    bottom: -180,
    left: -140,
    width: 380,
    height: 380,
    borderRadius: 190,
    backgroundColor: 'rgba(53, 230, 255, 0.08)'
  },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 22,
    paddingVertical: 40
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    marginBottom: 34,
    gap: 12
  },
  logoMark: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center'
  },
  logoLetter: {
    color: COLORS.primaryText,
    fontSize: 23,
    fontWeight: '900'
  },
  wordmark: {
    color: COLORS.text,
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: 1.5
  },
  wordmarkAccent: {
    color: COLORS.primary
  },
  tagline: {
    color: COLORS.textDim,
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 2.4,
    marginTop: 3
  },
  hero: {
    width: '100%',
    maxWidth: 440,
    marginBottom: 26
  },
  kicker: {
    color: COLORS.primary,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 2.6,
    marginBottom: 10
  },
  heroTitle: {
    color: COLORS.text,
    fontSize: 34,
    fontWeight: '900',
    letterSpacing: -1.2,
    lineHeight: 38
  },
  heroSub: {
    color: COLORS.textMuted,
    fontSize: 14,
    lineHeight: 21,
    marginTop: 12,
    maxWidth: 380
  },
  card: {
    width: '100%',
    maxWidth: 440,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 24,
    ...SHADOW.card
  },
  cardHeader: {
    marginBottom: 20
  },
  cardTitle: {
    color: COLORS.text,
    fontSize: 21,
    fontWeight: '800',
    letterSpacing: -0.4
  },
  cardSub: {
    color: COLORS.textMuted,
    fontSize: 13,
    marginTop: 5
  },
  errorBox: {
    backgroundColor: COLORS.dangerSoft,
    borderWidth: 1,
    borderColor: 'rgba(255, 107, 138, 0.35)',
    padding: 12,
    borderRadius: RADIUS.sm,
    marginBottom: 16
  },
  errorText: {
    color: COLORS.danger,
    fontSize: 12,
    lineHeight: 18
  },
  inputGroup: {
    marginBottom: 16
  },
  label: {
    color: COLORS.textDim,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.6,
    marginBottom: 8
  },
  input: {
    backgroundColor: COLORS.surfaceAlt,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    color: COLORS.text
  },
  button: {
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.md,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 6
  },
  buttonDisabled: {
    opacity: 0.6
  },
  buttonText: {
    color: COLORS.primaryText,
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 0.3
  },
  offlineHint: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
    gap: 8
  },
  hintDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: COLORS.success
  },
  hintText: {
    color: COLORS.textDim,
    fontSize: 12,
    fontWeight: '600'
  },
  switchButton: {
    marginTop: 14,
    alignItems: 'center'
  },
  switchText: {
    color: COLORS.textMuted,
    fontSize: 12
  },
  footer: {
    color: COLORS.textDim,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.6,
    marginTop: 28
  }
});

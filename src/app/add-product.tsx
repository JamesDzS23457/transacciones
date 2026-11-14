import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  Image,
  Alert,
  Platform
} from 'react-native';
import { useRouter } from 'expo-router';
import { SERVICES_CONFIG, useApp } from '../context/AppContext';
import { COLORS, RADIUS, SHADOW } from '../constants/brand';

export default function AddProductScreen() {
  const router = useRouter();
  const { user } = useApp();
  const [nombreproducto, setNombreproducto] = useState('');
  const [imagenproducto, setImagenproducto] = useState('');
  const [precio, setPrecio] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (!user) {
      router.replace('/');
    }
  }, [user]);

  const handleSubmit = async () => {
    setErrorMsg('');
    if (!nombreproducto.trim() || !imagenproducto.trim() || !precio.trim()) {
      setErrorMsg('Por favor llena todas las casillas requeridas');
      return;
    }

    const numPrice = parseFloat(precio);
    if (isNaN(numPrice) || numPrice <= 0) {
      setErrorMsg('Ingresa un precio numérico válido mayor a 0');
      return;
    }

    setLoading(true);
    try {
      const payload = JSON.stringify({
        nombreproducto,
        imagenproducto,
        precio: numPrice
      });

      let response: Response | null = await fetch(`${SERVICES_CONFIG.GATEWAY_URL}/products`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload
      }).catch(() => null);

      if (!response || !response.ok) {
        response = await fetch(`${SERVICES_CONFIG.PRODUCTS_URL}/products`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: payload
        });
      }

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Error al guardar el producto');
      }

      if (Platform.OS !== 'web') {
        Alert.alert('Éxito', 'Producto creado en la base de datos');
      }
      router.back();
    } catch (err: any) {
      setErrorMsg(err.message || 'Error al conectar con el microservicio');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.kickerRow}>
        <View style={styles.kickerLine} />
        <Text style={styles.kicker}>NUEVO ARTÍCULO</Text>
      </View>
      <Text style={styles.title}>Registrar producto</Text>
      <Text style={styles.subtitle}>
        El ID se genera automáticamente. Completa nombre, imagen y precio.
      </Text>

      <View style={styles.card}>
        {errorMsg ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{errorMsg}</Text>
          </View>
        ) : null}

        <View style={styles.inputGroup}>
          <Text style={styles.label}>NOMBRE DEL PRODUCTO</Text>
          <TextInput
            style={styles.input}
            placeholder="Ej. Teclado Gamer Inalámbrico"
            placeholderTextColor={COLORS.textDim}
            value={nombreproducto}
            onChangeText={setNombreproducto}
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>URL DE LA IMAGEN</Text>
          <TextInput
            style={styles.input}
            placeholder="https://images.unsplash.com/..."
            placeholderTextColor={COLORS.textDim}
            value={imagenproducto}
            onChangeText={setImagenproducto}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>

        {imagenproducto.trim().length > 10 && (
          <View style={styles.previewContainer}>
            <Text style={styles.previewLabel}>VISTA PREVIA</Text>
            <Image
              source={{ uri: imagenproducto }}
              style={styles.previewImage}
              resizeMode="cover"
            />
          </View>
        )}

        <View style={styles.inputGroup}>
          <Text style={styles.label}>PRECIO (USD)</Text>
          <TextInput
            style={styles.input}
            placeholder="Ej. 49.99"
            placeholderTextColor={COLORS.textDim}
            value={precio}
            onChangeText={setPrecio}
            keyboardType="decimal-pad"
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
            <Text style={styles.buttonText}>Guardar producto</Text>
          )}
        </TouchableOpacity>
      </View>
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
    maxWidth: 640,
    width: '100%',
    alignSelf: 'center'
  },
  kickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10
  },
  kickerLine: {
    width: 28,
    height: 2,
    backgroundColor: COLORS.primary
  },
  kicker: {
    color: COLORS.primary,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 2.4
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
    marginTop: 8,
    marginBottom: 22,
    lineHeight: 20
  },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.xl,
    padding: 22,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOW.card
  },
  errorBox: {
    backgroundColor: COLORS.dangerSoft,
    borderWidth: 1,
    borderColor: 'rgba(255, 107, 138, 0.35)',
    padding: 12,
    borderRadius: RADIUS.sm,
    marginBottom: 18
  },
  errorText: {
    color: COLORS.danger,
    fontSize: 12,
    lineHeight: 18
  },
  inputGroup: {
    marginBottom: 18
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
    fontSize: 14,
    color: COLORS.text
  },
  previewContainer: {
    marginBottom: 18
  },
  previewLabel: {
    color: COLORS.textDim,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.6,
    marginBottom: 8
  },
  previewImage: {
    width: '100%',
    height: 170,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.surfaceAlt
  },
  button: {
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.md,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 4
  },
  buttonDisabled: {
    opacity: 0.6
  },
  buttonText: {
    color: COLORS.primaryText,
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 0.2
  }
});

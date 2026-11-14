/**
 * Sistema de diseño de JAMES Store.
 * Un solo lugar para colores, radios y sombras: así el rediseño se mantiene
 * consistente en todas las pantallas.
 */

export const BRAND = {
  name: 'JAMES Store',
  wordmark: 'JAMES',
  wordmarkAccent: 'STORE',
  tagline: 'PREMIUM TECH MARKETPLACE'
};

export const COLORS = {
  bg: '#05070D',
  bgSoft: '#080C16',
  surface: '#0E1626',
  surfaceAlt: '#131F33',
  surfaceHigh: '#19273F',
  border: '#22324F',
  borderSoft: '#182640',
  text: '#F4F8FF',
  textMuted: '#8DA2C2',
  textDim: '#5F7494',
  primary: '#C9FF3D',
  primaryText: '#0A1206',
  primarySoft: 'rgba(201, 255, 61, 0.12)',
  accent: '#35E6FF',
  accentSoft: 'rgba(53, 230, 255, 0.12)',
  success: '#3EE6A1',
  successSoft: 'rgba(62, 230, 161, 0.12)',
  warning: '#FFC857',
  warningSoft: 'rgba(255, 200, 87, 0.12)',
  danger: '#FF6B8A',
  dangerSoft: 'rgba(255, 107, 138, 0.12)',
  overlay: 'rgba(3, 5, 10, 0.78)',
  white: '#FFFFFF'
};

export const RADIUS = {
  sm: 10,
  md: 14,
  lg: 20,
  xl: 28,
  pill: 999
};

export const SPACING = {
  xs: 6,
  sm: 10,
  md: 16,
  lg: 22,
  xl: 30
};

export const SHADOW = {
  card: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.32,
    shadowRadius: 24,
    elevation: 8
  },
  soft: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 4
  }
};

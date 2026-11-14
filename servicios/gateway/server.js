require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();
const PORT = process.env.PORT || 4000;

// URL de los microservicios (en local o en Render).
// En Render, `fromService: property: host` entrega solo el host
// (ej. transacciones-auth-service.onrender.com), sin protocolo. Sin esto,
// http-proxy-middleware no puede interpretar el destino y responde 504.
const normalizeServiceUrl = (value) => {
  let url = String(value || '').trim().replace(/\/+$/, '');
  if (!url) return url;
  if (/^https?:\/\//i.test(url)) return url;
  // Render puede entregar solo el nombre interno (ej. transacciones-auth-service).
  // Ese host no resuelve por HTTPS desde fuera de la red privada, así que se
  // completa con el dominio público de Render.
  if (!url.includes('.')) url = `${url}.onrender.com`;
  return `https://${url}`;
};

const AUTH_SERVICE_URL = normalizeServiceUrl(process.env.AUTH_SERVICE_URL || 'http://localhost:4001');
const PRODUCTS_SERVICE_URL = normalizeServiceUrl(process.env.PRODUCTS_SERVICE_URL || 'http://localhost:4002');
const ORDERS_SERVICE_URL = normalizeServiceUrl(process.env.ORDERS_SERVICE_URL || 'http://localhost:4003');

app.use(cors());

// Ruta raíz informativa del Gateway
app.get('/', (req, res) => {
  res.json({
    service: 'api-gateway',
    status: 'online',
    description: 'API Gateway Central de Microservicios',
    routes: {
      auth: '/api/auth/*',
      products: '/api/products/*',
      orders: '/api/orders/*'
    }
  });
});

// Health check del Gateway
app.get('/health', (req, res) => {
  res.json({
    service: 'api-gateway',
    status: 'healthy',
    microservices: {
      auth: AUTH_SERVICE_URL,
      products: PRODUCTS_SERVICE_URL,
      orders: ORDERS_SERVICE_URL
    },
    timestamp: new Date()
  });
});

// Proxy a Microservicio de Autenticación (/api/auth/*)
app.use(
  '/api/auth',
  createProxyMiddleware({
    target: AUTH_SERVICE_URL,
    changeOrigin: true,
    pathRewrite: {
      '^/api/auth': ''
    }
  })
);

// Proxy a Microservicio de Productos (/api/products/*)
app.use(
  '/api/products',
  createProxyMiddleware({
    target: PRODUCTS_SERVICE_URL,
    changeOrigin: true,
    pathRewrite: {
      '^/api/products': '/products'
    }
  })
);

// Proxy a Microservicio de Órdenes / Cálculo (/api/orders/*)
app.use(
  '/api/orders',
  createProxyMiddleware({
    target: ORDERS_SERVICE_URL,
    changeOrigin: true,
    pathRewrite: {
      '^/api/orders': ''
    }
  })
);

app.listen(PORT, () => {
  console.log(`API Gateway corriendo en http://localhost:${PORT}`);
});

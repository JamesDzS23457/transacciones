require('dotenv').config();
const express = require('express');
const cors = require('cors');
const pool = require('./db');

const app = express();
const PORT = process.env.PORT || 4002;

app.use(cors());
app.use(express.json());

// Control de rol simple para el proyecto: la app envía x-user-role.
// En un sistema real esto se validaría con el JWT firmado por auth-service.
const requireAdmin = (req, res, next) => {
  if (req.header('x-user-role') !== 'admin') {
    return res.status(403).json({ error: 'Solo el administrador puede modificar el catálogo' });
  }
  next();
};

// Ruta raíz informativa
app.get('/', (req, res) => {
  res.json({
    service: 'products-service',
    status: 'online',
    description: 'Microservicio de Catálogo de Productos',
    endpoints: {
      health: 'GET /health',
      getProducts: 'GET /products',
      getProductById: 'GET /products/:id',
      createProduct: 'POST /products (admin)',
      updateStock: 'PATCH /products/:id/stock (admin)',
      deleteProduct: 'DELETE /products/:id (admin)'
    }
  });
});

// Health check
app.get('/health', (req, res) => {
  res.json({ service: 'products-service', status: 'healthy', timestamp: new Date() });
});

// Obtener todos los productos
app.get('/products', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, nombreproducto, imagenproducto, precio, stock FROM productos ORDER BY id ASC'
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error al obtener productos:', error);
    res.status(500).json({ error: 'Error al obtener productos de la base de datos' });
  }
});

// Obtener un producto por ID
app.get('/products/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      'SELECT id, nombreproducto, imagenproducto, precio, stock FROM productos WHERE id = $1',
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error al obtener producto:', error);
    res.status(500).json({ error: 'Error al obtener el producto' });
  }
});

// Crear nuevo producto (solo admin)
app.post('/products', requireAdmin, async (req, res) => {
  try {
    const { nombreproducto, imagenproducto, precio, stock } = req.body;
    if (!nombreproducto || !imagenproducto || precio === undefined) {
      return res.status(400).json({ error: 'Campos obligatorios: nombreproducto, imagenproducto, precio' });
    }

    const numericPrice = parseFloat(precio);
    if (isNaN(numericPrice) || numericPrice < 0) {
      return res.status(400).json({ error: 'El precio debe ser un número válido mayor o igual a 0' });
    }

    const numericStock = stock === undefined || stock === '' ? 10 : parseInt(stock, 10);
    if (!Number.isInteger(numericStock) || numericStock < 0) {
      return res.status(400).json({ error: 'El stock debe ser un número entero mayor o igual a 0' });
    }

    const result = await pool.query(
      'INSERT INTO productos (nombreproducto, imagenproducto, precio, stock) VALUES ($1, $2, $3, $4) RETURNING id, nombreproducto, imagenproducto, precio, stock',
      [nombreproducto, imagenproducto, numericPrice, numericStock]
    );

    res.status(201).json({
      message: 'Producto creado exitosamente',
      product: result.rows[0]
    });
  } catch (error) {
    console.error('Error al crear producto:', error);
    res.status(500).json({ error: 'Error interno al guardar el producto' });
  }
});

// Ajustar stock (solo admin). Acepta { stock } absoluto o { delta } relativo.
app.patch('/products/:id/stock', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { stock, delta } = req.body;

    let result;
    if (stock !== undefined) {
      const value = parseInt(stock, 10);
      if (!Number.isInteger(value) || value < 0) {
        return res.status(400).json({ error: 'El stock debe ser un entero mayor o igual a 0' });
      }
      result = await pool.query(
        'UPDATE productos SET stock = $1 WHERE id = $2 RETURNING id, nombreproducto, imagenproducto, precio, stock',
        [value, id]
      );
    } else if (delta !== undefined) {
      const value = parseInt(delta, 10);
      if (!Number.isInteger(value)) {
        return res.status(400).json({ error: 'El delta debe ser un número entero' });
      }
      result = await pool.query(
        'UPDATE productos SET stock = GREATEST(stock + $1, 0) WHERE id = $2 RETURNING id, nombreproducto, imagenproducto, precio, stock',
        [value, id]
      );
    } else {
      return res.status(400).json({ error: 'Envía stock o delta' });
    }

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }

    res.json({ message: 'Stock actualizado', product: result.rows[0] });
  } catch (error) {
    console.error('Error al actualizar stock:', error);
    res.status(500).json({ error: 'Error interno al actualizar el stock' });
  }
});

// Eliminar producto por ID (solo admin)
app.delete('/products/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('DELETE FROM productos WHERE id = $1 RETURNING id', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }
    res.json({ message: 'Producto eliminado exitosamente', id: result.rows[0].id });
  } catch (error) {
    console.error('Error al eliminar producto:', error);
    res.status(500).json({ error: 'Error interno al eliminar producto' });
  }
});

app.listen(PORT, () => {
  console.log(`Products Service corriendo en el puerto ${PORT}`);
});

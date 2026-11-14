require('dotenv').config();
const express = require('express');
const cors = require('cors');
const pool = require('./db');

const app = express();
const PORT = process.env.PORT || 4003;
// Tasa de IVA por defecto 19%
const TAX_RATE = parseFloat(process.env.TAX_RATE || '0.19'); 

app.use(cors());
app.use(express.json());

// Ruta raíz informativa
app.get('/', (req, res) => {
  res.json({
    service: 'orders-service',
    status: 'online',
    description: 'Microservicio de Facturación, Compras y Cálculo de IVA',
    taxRate: TAX_RATE,
    endpoints: {
      health: 'GET /health',
      calculate: 'POST /calculate (body: items)',
      checkout: 'POST /checkout (body: usuario_id, items)',
      userOrders: 'GET /user-orders/:usuario_id'
    }
  });
});

// Health check
app.get('/health', (req, res) => {
  res.json({ service: 'orders-service', status: 'healthy', taxRate: TAX_RATE, timestamp: new Date() });
});

/**
 * Endpoint para cálculo de precios, IVA y total de una lista de items
 * Recibe: { items: [ { id, nombreproducto, precio, cantidad } ] }
 */
app.post('/calculate', (req, res) => {
  try {
    const { items } = req.body;

    if (!items || !Array.isArray(items)) {
      return res.status(400).json({ error: 'Se requiere una lista "items" en el cuerpo de la petición' });
    }

    let subtotal = 0;
    const detailedItems = items.map(item => {
      const price = parseFloat(item.precio) || 0;
      const quantity = parseInt(item.cantidad, 10) || 1;
      const itemSubtotal = price * quantity;
      subtotal += itemSubtotal;

      return {
        id: item.id,
        nombreproducto: item.nombreproducto,
        precio: price,
        cantidad: quantity,
        subtotal: parseFloat(itemSubtotal.toFixed(2))
      };
    });

    const iva = parseFloat((subtotal * TAX_RATE).toFixed(2));
    const total = parseFloat((subtotal + iva).toFixed(2));

    res.json({
      items: detailedItems,
      subtotal: parseFloat(subtotal.toFixed(2)),
      ivaRate: TAX_RATE,
      ivaPercentage: `${TAX_RATE * 100}%`,
      iva: iva,
      total: total,
      totalItems: detailedItems.reduce((acc, curr) => acc + curr.cantidad, 0)
    });
  } catch (error) {
    console.error('Error al calcular totales:', error);
    res.status(500).json({ error: 'Error interno al procesar el cálculo' });
  }
});

/**
 * Endpoint para procesar y confirmar la compra:
 * Guarda en la tabla `compras_usuario` vinculando usuario_id, producto_id y numero_factura
 * Recibe: { usuario_id, items: [ { id, precio, cantidad } ] }
 */
app.post('/checkout', async (req, res) => {
  const client = await pool.connect();
  try {
    const { usuario_id, items, numero_factura: facturaProvista } = req.body;

    if (!usuario_id) {
      return res.status(400).json({ error: 'usuario_id es requerido para registrar la compra' });
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'La lista de items no puede estar vacía' });
    }

    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const numero_factura = facturaProvista || `FAC-${dateStr}-${randomSuffix}`;

    // Idempotencia: si la factura ya existe, no se vuelve a descontar stock.
    const checkExist = await client.query(
      'SELECT * FROM compras_usuario WHERE numero_factura = $1 LIMIT 1',
      [numero_factura]
    );
    if (checkExist.rows.length > 0) {
      return res.status(200).json({
        message: 'Compra ya registrada previamente',
        numero_factura,
        yaRegistrada: true
      });
    }

    await client.query('BEGIN');

    let totalOrden = 0;
    let subtotalOrden = 0;
    let ivaOrden = 0;
    const registrosGuardados = [];

    for (const item of items) {
      const cantidad = parseInt(item.cantidad, 10) || 1;
      const precioUnitario = parseFloat(item.precio) || 0;
      const subtotalItem = parseFloat((precioUnitario * cantidad).toFixed(2));
      const ivaItem = parseFloat((subtotalItem * TAX_RATE).toFixed(2));
      const totalItem = parseFloat((subtotalItem + ivaItem).toFixed(2));

      // Bloquear el producto y validar stock antes de vender.
      const producto = await client.query(
        'SELECT id, nombreproducto, stock FROM productos WHERE id = $1 FOR UPDATE',
        [item.id]
      );

      if (producto.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: `El producto ${item.id} no existe` });
      }

      if (producto.rows[0].stock < cantidad) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          error: `Stock insuficiente para "${producto.rows[0].nombreproducto}". Disponible: ${producto.rows[0].stock}`
        });
      }

      subtotalOrden += subtotalItem;
      ivaOrden += ivaItem;
      totalOrden += totalItem;

      const insertQuery = `
        INSERT INTO compras_usuario
        (usuario_id, producto_id, numero_factura, cantidad, precio_unitario, subtotal, iva, total, estado)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'activa')
        RETURNING *;
      `;

      const result = await client.query(insertQuery, [
        usuario_id,
        item.id,
        numero_factura,
        cantidad,
        precioUnitario,
        subtotalItem,
        ivaItem,
        totalItem
      ]);

      registrosGuardados.push(result.rows[0]);

      // Descontar stock
      await client.query('UPDATE productos SET stock = stock - $1 WHERE id = $2', [
        cantidad,
        item.id
      ]);
    }

    await client.query('COMMIT');

    res.status(201).json({
      message: 'Compra registrada y guardada exitosamente en la base de datos',
      numero_factura,
      estado: 'activa',
      resumen: {
        subtotal: parseFloat(subtotalOrden.toFixed(2)),
        iva: parseFloat(ivaOrden.toFixed(2)),
        total: parseFloat(totalOrden.toFixed(2)),
        itemsCount: registrosGuardados.length
      },
      detalles: registrosGuardados
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error al procesar la compra:', error);
    res.status(500).json({ error: 'Error interno al registrar la compra en la base de datos' });
  } finally {
    client.release();
  }
});

/**
 * Cancelar una compra y devolver el stock de sus productos.
 * El dueño de la orden o un administrador pueden cancelarla.
 */
app.post('/cancel', async (req, res) => {
  const client = await pool.connect();
  try {
    const { numero_factura, usuario_id } = req.body;
    const isAdmin = req.header('x-user-role') === 'admin';

    if (!numero_factura) {
      return res.status(400).json({ error: 'numero_factura es requerido' });
    }
    if (!isAdmin && !usuario_id) {
      return res.status(400).json({ error: 'usuario_id es requerido' });
    }

    await client.query('BEGIN');

    const rows = await client.query(
      'SELECT * FROM compras_usuario WHERE numero_factura = $1 FOR UPDATE',
      [numero_factura]
    );

    if (rows.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Compra no encontrada' });
    }

    if (!isAdmin && String(rows.rows[0].usuario_id) !== String(usuario_id)) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'No puedes cancelar una compra de otro usuario' });
    }

    if (rows.rows[0].estado === 'cancelada') {
      await client.query('COMMIT');
      return res.json({ message: 'La compra ya estaba cancelada', numero_factura, yaCancelada: true });
    }

    await client.query(
      "UPDATE compras_usuario SET estado = 'cancelada' WHERE numero_factura = $1",
      [numero_factura]
    );

    for (const row of rows.rows) {
      await client.query('UPDATE productos SET stock = stock + $1 WHERE id = $2', [
        row.cantidad,
        row.producto_id
      ]);
    }

    await client.query('COMMIT');
    res.json({ message: 'Compra cancelada y stock devuelto', numero_factura, estado: 'cancelada' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error al cancelar la compra:', error);
    res.status(500).json({ error: 'Error interno al cancelar la compra' });
  } finally {
    client.release();
  }
});

/**
 * Borrar todo el historial de compras y reiniciar el stock (solo admin).
 */
app.delete('/all', async (req, res) => {
  if (req.header('x-user-role') !== 'admin') {
    return res.status(403).json({ error: 'Solo el administrador puede limpiar el historial' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const deleted = await client.query('DELETE FROM compras_usuario');
    await client.query('UPDATE productos SET stock = 10');
    await client.query("ALTER SEQUENCE compras_usuario_id_seq RESTART WITH 1");
    await client.query('COMMIT');

    res.json({
      message: 'Historial eliminado y stock reiniciado en 10',
      comprasEliminadas: deleted.rowCount
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error al limpiar el historial:', error);
    res.status(500).json({ error: 'Error interno al limpiar el historial' });
  } finally {
    client.release();
  }
});

/**
 * Obtener compras realizadas por un usuario
 */
app.get('/user-orders/:usuario_id', async (req, res) => {
  try {
    const { usuario_id } = req.params;
    const query = `
      SELECT c.*, p.nombreproducto, p.imagenproducto 
      FROM compras_usuario c
      JOIN productos p ON c.producto_id = p.id
      WHERE c.usuario_id = $1
      ORDER BY c.fecha_compra DESC;
    `;
    const result = await pool.query(query, [usuario_id]);
    res.json(result.rows);
  } catch (error) {
    console.error('Error al consultar compras de usuario:', error);
    res.status(500).json({ error: 'Error al consultar historial de compras' });
  }
});

app.listen(PORT, () => {
  console.log(`Orders/Tax Service corriendo en el puerto ${PORT}`);
});

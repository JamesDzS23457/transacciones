require('dotenv').config();
const pool = require('./db');
const bcrypt = require('bcryptjs');

async function seed() {
  try {
    console.log('--- Creando/actualizando tablas en PostgreSQL ---');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS usuarios (
        id SERIAL PRIMARY KEY,
        nombre VARCHAR(100) NOT NULL,
        correo VARCHAR(150) UNIQUE NOT NULL,
        contrasena VARCHAR(255) NOT NULL,
        rol VARCHAR(20) NOT NULL DEFAULT 'cliente',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS productos (
        id SERIAL PRIMARY KEY,
        nombreproducto VARCHAR(150) NOT NULL,
        imagenproducto TEXT NOT NULL,
        precio NUMERIC(10, 2) NOT NULL,
        stock INTEGER NOT NULL DEFAULT 10,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS compras_usuario (
        id SERIAL PRIMARY KEY,
        usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
        producto_id INTEGER NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
        numero_factura VARCHAR(50) NOT NULL,
        cantidad INTEGER NOT NULL DEFAULT 1,
        precio_unitario NUMERIC(10, 2) NOT NULL,
        subtotal NUMERIC(10, 2) NOT NULL,
        iva NUMERIC(10, 2) NOT NULL,
        total NUMERIC(10, 2) NOT NULL,
        estado VARCHAR(20) NOT NULL DEFAULT 'activa',
        fecha_compra TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Migraciones para bases de datos creadas con versiones anteriores
    await pool.query(`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS rol VARCHAR(20) NOT NULL DEFAULT 'cliente'`);
    await pool.query(`ALTER TABLE productos ADD COLUMN IF NOT EXISTS stock INTEGER NOT NULL DEFAULT 10`);
    await pool.query(`ALTER TABLE compras_usuario ADD COLUMN IF NOT EXISTS estado VARCHAR(20) NOT NULL DEFAULT 'activa'`);

    console.log('Tablas listas.');

    // Usuarios: james (admin) y cliente (normal)
    const hash = await bcrypt.hash('123456', 10);

    await pool.query(
      `INSERT INTO usuarios (nombre, correo, contrasena, rol)
       VALUES ('James', 'james', $1, 'admin')
       ON CONFLICT (correo) DO UPDATE
         SET contrasena = EXCLUDED.contrasena, rol = 'admin'`,
      [hash]
    );

    await pool.query(
      `INSERT INTO usuarios (nombre, correo, contrasena, rol)
       VALUES ('Cliente', 'cliente', $1, 'cliente')
       ON CONFLICT (correo) DO UPDATE
         SET contrasena = EXCLUDED.contrasena, rol = 'cliente'`,
      [hash]
    );

    console.log('Usuarios listos: james/123456 (admin) y cliente/123456 (cliente).');

    // Productos demo con stock inicial
    const checkProd = await pool.query('SELECT COUNT(*) FROM productos');
    if (parseInt(checkProd.rows[0].count) === 0) {
      const demoProducts = [
        ['Laptop Gamer Pro', 'https://images.unsplash.com/photo-1603302576837-37561b2e2302?w=500&q=80', 1250.0, 10],
        ['Auriculares Inalámbricos', 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=500&q=80', 79.99, 10],
        ['Teclado Mecánico RGB', 'https://images.unsplash.com/photo-1587829741301-dc798b83add3?w=500&q=80', 89.5, 10],
        ['Mouse Ergonómico', 'https://images.unsplash.com/photo-1527864550417-7fd91fc51a46?w=500&q=80', 35.0, 10],
        ['Monitor 4K UltraWide', 'https://images.unsplash.com/photo-1527443224154-c4a3942d3acf?w=500&q=80', 399.0, 10]
      ];

      for (const p of demoProducts) {
        await pool.query(
          'INSERT INTO productos (nombreproducto, imagenproducto, precio, stock) VALUES ($1, $2, $3, $4)',
          p
        );
      }
      console.log('Productos demo insertados con stock inicial de 10.');
    } else {
      await pool.query('UPDATE productos SET stock = 10 WHERE stock IS NULL OR stock = 0');
      console.log('Ya existen productos; se normalizó el stock en 10 donde faltaba.');
    }

    console.log('Seeder completado satisfactoriamente.');
    process.exit(0);
  } catch (err) {
    console.error('Error ejecutando el seeder:', err);
    process.exit(1);
  }
}

seed();

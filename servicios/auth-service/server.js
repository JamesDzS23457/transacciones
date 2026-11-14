require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('./db');

const app = express();
const PORT = process.env.PORT || 4001;
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_me';
if (!process.env.JWT_SECRET) {
  console.warn('⚠️ [Auth] JWT_SECRET no está configurado; se usa un valor de desarrollo.');
}

app.use(cors());
app.use(express.json());

// El frontend envía x-user-role / x-user-id para las operaciones de admin.
// En un sistema real esto se validaría con el JWT firmado.
const requireAdmin = (req, res, next) => {
  if (req.header('x-user-role') !== 'admin') {
    return res.status(403).json({ error: 'Solo el administrador puede realizar esta acción' });
  }
  next();
};

// Ruta raíz informativa
app.get('/', (req, res) => {
  res.json({
    service: 'auth-service',
    status: 'online',
    description: 'Microservicio de Autenticación y Usuarios',
    endpoints: {
      health: 'GET /health',
      register: 'POST /register (body: nombre, correo, contrasena)',
      login: 'POST /login (body: correo, contrasena)',
      verify: 'GET /verify'
    }
  });
});

// Health check
app.get('/health', (req, res) => {
  res.json({ service: 'auth-service', status: 'healthy', timestamp: new Date() });
});

// Registro de usuario
app.post('/register', async (req, res) => {
  try {
    const { nombre, correo, contrasena } = req.body;
    if (!nombre || !correo || !contrasena) {
      return res.status(400).json({ error: 'Todos los campos son obligatorios: nombre, correo, contrasena' });
    }

    const userExists = await pool.query('SELECT id FROM usuarios WHERE correo = $1', [correo]);
    if (userExists.rows.length > 0) {
      return res.status(400).json({ error: 'El correo electrónico ya se encuentra registrado' });
    }

    const hashedPassword = await bcrypt.hash(contrasena, 10);
    // Todo usuario que se registra desde la app entra como cliente.
    // El rol admin solo se asigna directamente en la base de datos.
    const result = await pool.query(
      "INSERT INTO usuarios (nombre, correo, contrasena, rol) VALUES ($1, $2, $3, 'cliente') RETURNING id, nombre, correo, rol",
      [nombre, correo, hashedPassword]
    );

    const user = result.rows[0];
    const token = jwt.sign(
      { id: user.id, correo: user.correo, nombre: user.nombre, rol: user.rol },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({
      message: 'Usuario registrado exitosamente',
      user,
      token
    });
  } catch (error) {
    console.error('Error en /register:', error);
    res.status(500).json({ error: 'Error interno del servidor al registrar usuario' });
  }
});

// Inicio de sesión (Login)
app.post('/login', async (req, res) => {
  try {
    const { correo, contrasena } = req.body;
    if (!correo || !contrasena) {
      return res.status(400).json({ error: 'Debe ingresar correo y contrasena' });
    }

    const result = await pool.query('SELECT * FROM usuarios WHERE correo = $1', [correo]);
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    const user = result.rows[0];
    const validPassword = await bcrypt.compare(contrasena, user.contrasena);
    if (!validPassword) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    const token = jwt.sign(
      { id: user.id, correo: user.correo, nombre: user.nombre, rol: user.rol },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      message: 'Inicio de sesión exitoso',
      user: {
        id: user.id,
        nombre: user.nombre,
        correo: user.correo,
        rol: user.rol
      },
      token
    });
  } catch (error) {
    console.error('Error en /login:', error);
    res.status(500).json({ error: 'Error interno del servidor al autenticar' });
  }
});

// Listar usuarios (solo admin)
app.get('/users', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, nombre, correo, rol, created_at FROM usuarios ORDER BY id ASC'
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error al listar usuarios:', error);
    res.status(500).json({ error: 'Error interno al listar usuarios' });
  }
});

// Eliminar usuario (solo admin). Devuelve el stock de sus compras activas.
app.delete('/users/:id', requireAdmin, async (req, res) => {
  const { id } = req.params;
  const requesterId = req.header('x-user-id');

  if (requesterId && String(id) === String(requesterId)) {
    return res.status(400).json({ error: 'No puedes eliminar tu propia cuenta' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const target = await client.query(
      'SELECT id, nombre, correo, rol FROM usuarios WHERE id = $1 FOR UPDATE',
      [id]
    );

    if (target.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    if (target.rows[0].rol === 'admin') {
      const admins = await client.query("SELECT COUNT(*)::int AS n FROM usuarios WHERE rol = 'admin'");
      if (admins.rows[0].n <= 1) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'No puedes eliminar al único administrador' });
      }
    }

    // Devolver stock de las compras que siguen activas antes de borrar al usuario.
    const purchases = await client.query(
      "SELECT producto_id, cantidad FROM compras_usuario WHERE usuario_id = $1 AND estado = 'activa' FOR UPDATE",
      [id]
    );
    for (const row of purchases.rows) {
      await client.query('UPDATE productos SET stock = stock + $1 WHERE id = $2', [
        row.cantidad,
        row.producto_id
      ]);
    }

    await client.query('DELETE FROM usuarios WHERE id = $1', [id]);
    await client.query('COMMIT');

    res.json({
      message: 'Usuario eliminado y stock devuelto',
      id: Number(id),
      nombre: target.rows[0].nombre,
      correo: target.rows[0].correo
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error al eliminar usuario:', error);
    res.status(500).json({ error: 'Error interno al eliminar el usuario' });
  } finally {
    client.release();
  }
});

// Validar token
app.get('/verify', (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ valid: false, error: 'Token no proporcionado' });

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    res.json({ valid: true, user: decoded });
  } catch (err) {
    res.status(401).json({ valid: false, error: 'Token inválido o expirado' });
  }
});

app.listen(PORT, () => {
  console.log(`Auth Service corriendo en el puerto ${PORT}`);
});

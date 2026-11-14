# JAMES Store — Carrito de compras con microservicios

Aplicación móvil/web de comercio electrónico desarrollada con **React Native + Expo**, con un backend de **microservicios en Node.js/Express** y base de datos **PostgreSQL (Neon)**.

## Demo en línea

- **Aplicación web:** https://transacciones-delta.vercel.app
- **Gateway (API):** https://transacciones-gateway.onrender.com
- **Administrador:** `james` / `123456`
- **Cliente:** `cliente` / `123456`

> La demo usa los microservicios desplegados en Render. La primera petición puede tardar hasta un minuto porque el plan gratuito suspende los servicios cuando están inactivos.

## Funcionalidades

- Inicio de sesión con autenticación JWT.
- Catálogo de productos con búsqueda, stock y creación de productos (admin).
- Roles: **admin** puede crear productos y aumentar/disminuir stock; **cliente** solo compra.
- Registro de usuarios habilitado: los nuevos usuarios entran con rol `cliente`.
- Carrito de compras con cantidades y cálculo de subtotal, IVA (19%) y total.
- Al confirmar una compra se descuenta el stock; al cancelarla se devuelve.
- Registro de compras y factura electrónica imprimible / descargable en PDF.
- Historial de compras por usuario, con estado activa/cancelada.
- **Modo offline:** si no hay internet, la compra se guarda en SQLite (móvil) o AsyncStorage (web) y se sincroniza automáticamente al recuperar la conexión.
- Interfaz **dark premium** responsive.

## Arquitectura

```
App Expo (React Native / Web)
        |
        v
API Gateway (:4000)
   |        |        |
   v        v        v
Auth     Products   Orders
(:4001)  (:4002)   (:4003)
   \        |        /
    \       v       /
     PostgreSQL (Neon)
```

- **gateway:** único punto de entrada para la app; redirige a cada microservicio.
- **auth-service:** registro, login y verificación de usuarios con bcrypt + JWT.
- **products-service:** CRUD del catálogo.
- **orders-service:** cálculo de IVA, checkout e historial de compras.
- **Base de datos:** PostgreSQL en Neon.

## Estructura del proyecto

```
CarritoCompra/
├── src/
│   ├── app/                 # Pantallas (Expo Router)
│   ├── components/          # Componentes reutilizables
│   ├── constants/brand.ts   # Sistema de diseño (colores, radios, sombras)
│   ├── context/             # Estado global de la app
│   └── services/            # Offline (SQLite) y sincronización
├── servicios/
│   ├── gateway/
│   ├── auth-service/
│   ├── products-service/
│   └── orders-service/
├── assets/
├── app.json
├── render.yaml              # Despliegue de los 4 servicios en Render
└── vercel.json              # Despliegue web en Vercel
```

## Cómo ejecutar la app (frontend)

Requiere **Node.js 20 o superior**.

```bash
npm install
npx expo start
```

Luego:

- `w` para abrir en el navegador.
- `a` para Android.
- `i` para iOS.
- O escanear el QR con Expo Go.

La app apunta a los microservicios ya desplegados en Render, por lo que **no es necesario levantar el backend** para probarla.

## Cómo ejecutar el backend local (opcional)

Cada servicio necesita su propio archivo `.env`. En el ZIP se incluyen `.env.example` como plantilla (las credenciales reales no se incluyen por seguridad).

1. Crea una base de datos PostgreSQL (Neon, Supabase, Render, etc.).
2. En cada carpeta de `servicios/`, copia `.env.example` a `.env` y completa:

```bash
DATABASE_URL=postgresql://usuario:password@host/base_de_datos?sslmode=require
```

3. Instala dependencias y ejecuta cada servicio:

```bash
# Terminal 1
cd servicios/auth-service
npm install
npm start

# Terminal 2
cd servicios/products-service
npm install
npm start

# Terminal 3
cd servicios/orders-service
npm install
npm start

# Terminal 4
cd servicios/gateway
npm install
npm start
```

4. Crea las tablas y los datos iniciales:

```bash
cd servicios/auth-service
npm run seed
```

5. Ajusta en `src/context/AppContext.tsx` las URLs de `SERVICES_CONFIG` si usas servicios locales.

## Notas de seguridad

- El ZIP **no incluye** archivos `.env` ni credenciales reales.
- Las credenciales de la base de datos y el `JWT_SECRET` se configuran como variables de entorno en Render.
- Usuarios de la demo: `james` / `123456` (admin) y `cliente` / `123456` (cliente).
- El registro público crea siempre usuarios con rol `cliente`.

## Autor

James — Proyecto de carrito de compras con microservicios.

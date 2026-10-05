# Waveframe — Video Music Player

Reproductor web de videos musicales con una cola construida sobre una **lista doblemente enlazada implementada desde cero en TypeScript**. Busca videos públicos de YouTube y reproduce su video y audio en el reproductor oficial integrado. No requiere iniciar sesión con Spotify ni que el usuario tenga una cuenta Premium.

## Funciones

- Búsqueda de videos públicos de YouTube mediante el backend.
- Reproducción integrada con el reproductor oficial de YouTube (video visible).
- Botón para agregar archivos MP3 y MP4 locales al final de la fila; se reproducen desde el dispositivo y no se suben al servidor.
- Cola temporal con agregar al inicio, al final y en una posición numerada específica.
- Adelantar, retroceder, seleccionar, reordenar, eliminar y vaciar la cola. La pista terminada o saltada sale de la fila activa.
- Historial independiente de canciones escuchadas o saltadas en la sesión, con opción para volver a reproducirlas.
- Aleatorio sin repetir canciones hasta recorrer la fila; en orden normal, avanzar desde la última canción vuelve a la primera.
- Repetición, barra de progreso y visualización de `prev` y `next` en cada nodo.
- La fila, la búsqueda y los resultados empiezan vacíos cada vez que se abre o recarga la aplicación.
- Al vaciarse la fila, puede buscar una sugerencia contextual a partir del historial y agregar una sola pista para continuar. Se puede desactivar desde "Sugerencias al terminar".
- Interfaz adaptable a pantallas móviles y escritorio.

## Estructura

```text
client/                  React, TypeScript, Vite y Tailwind CSS
  src/components/         Integración oficial del reproductor IFrame
  src/structures/         Lista doblemente enlazada genérica
  src/App.tsx             UI, controles y operaciones de la cola
server/                  API Express en TypeScript
  src/index.ts            Salud, estado y búsqueda de YouTube
.env.example              Variables de entorno de ejemplo
pnpm-workspace.yaml       Workspace cliente + servidor
```

## Lista doblemente enlazada

`Node<T>` conserva el valor y sus enlaces `next` y `prev`. `DoublyLinkedList<T>` mantiene `head`, `tail`, el nodo actual y el tamaño. Tiene operaciones para insertar al inicio, al final o en una posición; eliminar por posición o ID; recorrer hacia adelante/atrás; localizar nodos; vaciar; y generar una instantánea para el render.

La cola y su navegación real viven en la lista enlazada. React usa `toArray()` solamente como instantánea de lectura para pintar la interfaz, no para decidir qué pista sigue.

## Requisitos y desarrollo local

Necesitas Node.js 20+ y pnpm. Desde la raíz:

```bash
pnpm install
# Windows PowerShell: copia los ejemplos de cada servicio y edítalos
Copy-Item server/.env.example server/.env
Copy-Item client/.env.example client/.env.local
pnpm dev
```

El cliente queda en `http://localhost:5173` y la API en `http://localhost:4000`. La búsqueda de videos públicos requiere `YOUTUBE_API_KEY`. La fila es temporal y se borra al cerrar o recargar la aplicación.

### Habilitar búsqueda de YouTube

1. En Google Cloud Console crea o selecciona un proyecto.
2. Habilita **YouTube Data API v3** y crea una API key.
3. Configura `YOUTUBE_API_KEY` en `server/.env` local y como variable secreta del servicio backend en la nube.
4. Restringe la clave a YouTube Data API v3 y evita publicarla en el repositorio. La clave se usa solo desde el servidor.
5. Ajusta `CLIENT_ORIGIN` con la URL pública exacta del frontend. Para varios orígenes, sepáralos por comas.
6. En el servicio frontend define `VITE_API_URL` con la URL pública del backend, sin `/` final, y vuelve a desplegar el frontend.

La búsqueda utiliza YouTube Data API v3. Google aplica cuotas al proyecto de API; revisa la consola de Google Cloud para ver la cuota vigente.

## Archivos locales

El botón **Archivo local** acepta MP3 y MP4 y siempre los agrega al final de la fila. Los archivos se reproducen en el navegador del dispositivo mediante sus URLs temporales; no se envían al backend y desaparecen al cerrar o recargar la aplicación. La posición de reproducción y el volumen usan los controles del reproductor.

## Sugerencias al terminar

Cuando ya no hay pistas pendientes, la continuación automática consulta YouTube Data API v3 con términos derivados de los artistas o títulos del historial. Filtra identificadores ya escuchados en la sesión y agrega una sola sugerencia cada vez. Es una búsqueda contextual, no un sistema de recomendaciones personalizadas de YouTube. El control **Sugerencias al terminar** permite desactivarla; al apagarla se conserva el ciclo de reproducción de la fila.

## Reproducción de YouTube

La aplicación inserta el reproductor oficial de YouTube y deja visible el video junto con su audio. No extrae el audio ni reproduce en segundo plano. Algunos propietarios bloquean la inserción de sus videos; en ese caso la aplicación muestra un error y se puede elegir otro resultado. Los navegadores también pueden pedir un clic en **Reproducir** antes de iniciar medios.

## Compilación

```bash
pnpm build
pnpm start
```

`pnpm start` inicia la API compilada. Para desplegar, configura las variables en el panel del proveedor; no subas `.env`.

## Desplegar este proyecto en servicios nuevos e independientes

Este proyecto es independiente del reproductor anterior: súbelo a **otro repositorio GitHub**. Desde esta carpeta raíz:

```bash
git init
git add .
git commit -m "Initial Waveframe player"
git remote add origin URL_DEL_REPO_NUEVO
git branch -M main
git push -u origin main
```

Crea dos servicios nuevos conectados a ese mismo repositorio:

### Frontend nuevo en Vercel

1. Importa el repositorio nuevo como un proyecto nuevo de Vercel.
2. Selecciona `client` como **Root Directory** y Vite como framework.
3. Usa `pnpm build` como build command y `dist` como output directory.
4. Define `VITE_API_URL` con la URL pública del backend nuevo de Render, sin `/` al final.
5. Despliega y copia el dominio asignado a Vercel.

### Backend nuevo en Render

1. Crea un **Web Service nuevo** desde el mismo repositorio.
2. Deja **Root Directory** en la raíz del repositorio para que pnpm encuentre el workspace y el lockfile.
3. Build command: `pnpm install --frozen-lockfile && pnpm --filter @waveframe/server build`.
4. Start command: `pnpm --filter @waveframe/server start`.
5. Añade `CLIENT_ORIGIN` con el dominio del frontend de Vercel, `YOUTUBE_API_KEY` como secreto y `PORT` si Render no lo configura automáticamente.
6. Copia la URL del servicio Render a `VITE_API_URL` en Vercel y vuelve a desplegar el frontend.

No reutilices servicios, variables ni dominios del proyecto anterior. El nuevo backend necesita su propia clave de YouTube Data API v3 y el dominio Vercel nuevo en `CLIENT_ORIGIN`.

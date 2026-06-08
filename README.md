# Web Conductor 🇦🇷 - Dirección del Himno Nacional con Gestos

Web Conductor es una aplicación interactiva que te permite dirigir el **Himno Nacional Argentino** en tiempo real mediante gestos de tus manos capturados por la cámara web, utilizando inteligencia artificial y síntesis de audio interactiva.

El proyecto está diseñado con una estética patriótica argentina que incluye la bandera nacional, el Escudo Nacional y un panel de control estilizado en tonos celeste, blanco y oro.

---

## 🎮 Instrucciones de Dirección y Gestos

| Gesto / Control | Acción / Efecto |
| --- | --- |
| **Mano Izquierda (Vertical)** | **Control de Volumen maestro**: Sube la mano para aumentar la potencia sonora (hasta 100%) y bájala para silenciarla. |
| **Mano Derecha (Vertical)** | **Control de Tempo (BPM)**: Sube la mano para acelerar el ritmo del himno y bájala para hacerlo más lento (rango de 50 a 180 BPM). |
| **Puño Derecho Cerrado** | **Reinicio de la Canción**: Cierra el puño de tu mano derecha por un segundo para detener y reiniciar el himno al instante con los valores por defecto (Volumen 70%, Tempo 90 BPM). |
| **Articulaciones Audio-Reactivas** | Las esferas dibujadas en el esqueleto de tus manos pulsan en escala y brillo en sincronía directa con el volumen real de la música. |

---

## 📁 Estructura del Repositorio

El repositorio está organizado como un único directorio listo para subir a GitHub:

- **Versión React + TypeScript + Vite**:
  - `src/`: Código fuente de los componentes visuales (`src/components/`), el motor de audio interactivo (`src/hooks/useAudioEngine.ts`) y el rastreo de manos (`src/hooks/useHandTracking.ts`).
  - `public/`: Contiene el archivo `himno-argentino.mp3` de alta calidad y el archivo gráfico `escudo-argentino.png` del Escudo Nacional.
  - Archivos de configuración: `package.json`, `tsconfig.json`, `vite.config.ts`, `.gitignore`.
- **Versión Standalone (Autónoma)**:
  - `web-conductor.html`: Archivo HTML único que incluye todo el CSS de glassmorphism patriótico, las librerías CDN de Tone.js/MediaPipe y el archivo de audio codificado en Base64 de forma local. **Funciona 100% offline.**
  - `escudo-argentino.png`: Escudo nacional cargado localmente por la versión standalone.

---

## 🚀 Cómo Ejecutar la Aplicación

### Opción A: Aplicación React (Desarrollo local)

1. Asegúrate de tener instalado [Node.js](https://nodejs.org/).
2. Abre una terminal en la carpeta del proyecto y ejecuta el instalador de dependencias:
   ```bash
   npm install
   ```
3. Inicia el servidor de desarrollo:
   ```bash
   npm run dev
   ```
4. Abre la dirección `http://localhost:5173/` en tu navegador.

### Opción B: Versión Standalone (Rápida / Offline)

1. Abre directamente el archivo `web-conductor.html` haciendo doble clic en tu explorador de archivos.
2. (Recomendado) O sirve el directorio utilizando una extensión de servidor local o ejecutando:
   ```bash
   npx vite
   ```
   y navegando a `http://localhost:5173/web-conductor.html`.

---

## 🛠 Tecnologías Utilizadas

- **MediaPipe Tasks Vision**: Detección e interpretación tridimensional de articulaciones de manos mediante IA.
- **Tone.js**: Control interactivo y nivelación de volumen del audio digital en tiempo real.
- **React 19 & TypeScript**: Estructura de componentes ágil y segura.
- **Vite 8**: Servidor de desarrollo ultrarrápido y empaquetador eficiente.
- **CSS Vanilla (Glassmorphism & Radial Gradients)**: Diseño estético premium adaptativo.

---
Creado con orgullo y patriotismo. ¡Dirige con fuerza y que suene el himno nacional! 🇦🇷

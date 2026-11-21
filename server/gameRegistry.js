// Auto-discovers available game folders in the workspace and provides catalog metadata
import fs from 'node:fs';
import path from 'node:path';

const GAME_CATALOG_META = {
  campal: {
    id: 'campal',
    name: 'CAMPAL',
    tagline: 'Batalla Campal Pixel Art',
    genre: 'Battle Royale',
    maxPlayers: 24,
    accent: '#ef4444',
    thumbnail: '/games/campal/preview-thumb.png',
    url: '/games/campal/',
    description: '24 luchadores en una sola arena pixel art 3/4 con armas, cajas destructibles, arbustos, bidones explosivos y bots tácticos.',
    controls: 'WASD + Ratón · E recoger · Espacio esquivar',
    recordLabel: 'Más bajas / Victorias',
  },
  cuberacer: {
    id: 'cuberacer',
    name: 'CUBE RACER 3D',
    tagline: 'Carreras 3D en Parrilla de 24',
    genre: 'Carreras 3D',
    maxPlayers: 24,
    accent: '#38bdf8',
    thumbnail: '/games/cuberacer/image.png',
    url: '/games/cuberacer/',
    description: 'Pistas 3D procedurales con desniveles y curvas personalizables. Parrilla de salida de 4×6 para hasta 24 pilotos simultáneos.',
    controls: 'WASD / Flechas · C cámara',
    recordLabel: 'Mejor tiempo y puntos',
  },
  cxvallas: {
    id: 'cxvallas',
    name: 'CXVALLAS 24',
    tagline: 'Estadio Olímpico de 24 Calles',
    genre: 'Atletismo',
    maxPlayers: 24,
    accent: '#f59e0b',
    thumbnail: '/games/cxvallas/captura.png',
    url: '/games/cxvallas/',
    description: 'Sprint frenético de vallas pixel art ampliado a un mega-estadio de 24 calles simultáneas. ¡Cuidado con la salida en falso!',
    controls: 'D correr rápido · A saltar vallas',
    recordLabel: 'Récord de tiempo (s)',
  },
  mecanorace: {
    id: 'mecanorace',
    name: 'MECANORACE',
    tagline: 'Gran Premio de Mecanografía 24P',
    genre: 'Velocidad',
    maxPlayers: 24,
    accent: '#00ffcc',
    thumbnail: '/games/mecanorace/botanic.png',
    url: '/games/mecanorace/',
    description: 'Competición en tiempo real para 24 mecanógrafos con el mismo texto, radar de progreso en vivo, gráfica neón y fantasma del récord.',
    controls: 'Teclado (velocidad y precisión)',
    recordLabel: 'Récord de PPM',
  },
  racermaster: {
    id: 'racermaster',
    name: 'RACER MASTER',
    tagline: 'Grand Prix Pseudo-3D Retro',
    genre: 'Arcade OutRun',
    maxPlayers: 24,
    accent: '#22c55e',
    thumbnail: '/games/racermaster/preview.svg',
    url: '/games/racermaster/',
    description: 'Clásico arcade estilo OutRun a toda velocidad con parrilla de 24 coches, circuito sincronizado a 2 vueltas y adelantamientos.',
    controls: 'WASD / Flechas para conducir',
    recordLabel: 'Mejor tiempo en pista',
  },
  trobix: {
    id: 'trobix',
    name: 'TRÒBIX',
    tagline: 'Batalla de Mapas Interactivos 24P',
    genre: 'Quiz / Mapas',
    maxPlayers: 24,
    accent: '#a855f7',
    thumbnail: '/games/trobix/image.png',
    url: '/games/trobix/',
    description: 'Duelo simultáneo de 24 jugadores sobre 10 mapas interactivos (España, Mundo, Europa, Anatomía…). ¡Encuentra cada objetivo antes que nadie!',
    controls: 'Ratón / Táctil (zoom y clic)',
    recordLabel: 'Puntuación récord',
  },
};

export function discoverGames(rootDir) {
  const entries = fs.readdirSync(rootDir, { withFileTypes: true });
  const games = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const meta = GAME_CATALOG_META[entry.name];
    if (meta) {
      games.push({ ...meta, folder: entry.name });
    }
  }
  const order = Object.keys(GAME_CATALOG_META);
  games.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
  return games;
}

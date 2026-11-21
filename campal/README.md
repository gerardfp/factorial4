# CAMPAL — Batalla Campal Pixel Art (hasta 24 jugadores)

Juego web multijugador masivo tipo batalla campal en estética **pixel art low-pixel sin bordes** (paleta ampliada con tonos de tierra, piedra y vegetación) con personajes esbeltos de **16×24px** (≤ 32×32px) y **campo de batalla completo visible en una sola pantalla (640×368px)** en perspectiva 3/4.

## Características

- **Campo de batalla completo sin panning**: los 24 jugadores, armas y coberturas se ven al mismo tiempo en pantalla fija con escalado pixel-perfect.
- **Pixel art low-pixel sin bordes (lineless) y perspectiva 3/4**: personajes estilizados de 16×24px con 8 estilos y objetos con cara superior, cara frontal y sombra proyectada en el suelo.
- **Multijugador web hasta 24 jugadores por partida** con servidor autoritativo en Node.js y WebSockets (sin dependencias externas).
- **Salas públicas y privadas** con opción de rellenar huecos vacíos con **bots tácticos** hasta completar 24 luchadores.
- **Descampado procedural** con obstáculos en perspectiva 3/4 para cubrirse y flanquear:
  - **Rocas**, **muros en ruinas** y **coches abandonados** (cobertura sólida indestructible).
  - **Cajas de madera** (cobertura destructible que puede soltar armas o botiquines).
  - **Bidones explosivos** (explotan en cadena al recibir daño).
  - **Arbustos densos** (te ocultan a distancia para emboscadas).
- **Armas improvisadas y de campo**: Puños, Tubo, Hacha, Ladrillos arrojadizos, Tirachinas, Pistola, Escopeta, Rifle y Cóctel Molotov, además de Botiquines.
- **Modo espectador completo al caer**, marcador de bajas y sonido retro 8-bit generado por Web Audio API.

## Cómo ejecutar

Requiere Node.js 18+.

```bash
npm start
```

Abre `http://localhost:3000` en tu navegador (o compártelo en red local para jugar con hasta 24 personas).

## Controles

- **WASD / Flechas**: Moverse
- **Ratón + Clic izquierdo**: Apuntar y atacar
- **E / F**: Recoger o intercambiar arma del suelo
- **1 / 2 / Q / Rueda**: Cambiar de ranura de arma
- **Espacio / Shift**: Esquiva rápida (dash)
- **M**: Silenciar / activar audio 8-bit

## Pruebas

```bash
npm test
```

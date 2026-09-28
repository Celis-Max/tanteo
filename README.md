# Tanteo · Liga MX

**La corazonada, en números.**

Modelo estadístico para estimar probabilidades de los partidos de Liga MX y armar parlays
sabiendo qué valor esperado tienen. **No predice resultados**: calcula probabilidades y las
compara contra la cuota que te ofrecen.

## Uso

```
./actualizar.sh              # baja datos, recalcula la jornada y abre la página
./actualizar.sh --backtest   # además revalida el modelo (tarda varios minutos)
```

La web son cuatro páginas en `web/`: **index** (portada con los accesos), **partidos**
(jornadas y predicciones), **parlays** (sugeridos y armador) y **simulador** (el libro de tickets).
Todas llevan la misma barra de navegación y el mismo pie.

Se abren con doble clic, sin internet ni servidor. Ya no es un archivo suelto: las cuatro comparten
`estilo.css`, `comun.js` y `datos.js`, y se cargan con `<script src>`, que sí funciona bajo `file://`
(a diferencia de `fetch`, que el navegador bloquea). Si mueves la web, mueve la carpeta completa.

La combinación que armas queda guardada en la dirección **y** en el navegador, así que sobrevive
al cambiar de página y puedes copiar el link para volver a ella.

## Marca y tema

**Tanteo**: en México el *tanteo* es el marcador de un partido, y *tantear* es calcular a ojo.
Eso hace esto: convierte el tanteo en cálculo.

El tema es **mesa de juego**: fieltro verde, paneles de carta en crema, filos dorados y acentos
vino. La idea es que el sitio se lea como una mesa donde se reparten cartas, no como un tablero
de estadio.

- Paleta: fieltro `#1F5E47`, carta `#F3EFE6`, vino `#C1121F`, oro `#9C7A33`/`#E4C877`.
- Tipografías: **Great Vibes** (la marca), **Bodoni Moda** (títulos), **Manrope** (texto).
- `web/marca/tanteo-mesa.jpg` — la imagen de marca que abre la portada.
- Los estilos viven en `web/estilo.css`.

**Las fuentes van autoalojadas** en `web/marca/fuentes/` (453 KB, subconjuntos latino y latino
extendido), no enlazadas a Google. Es a propósito: la página tiene que abrir sin internet, y un
`<link>` a fonts.googleapis.com la dejaría con tipografías del sistema al estar desconectado.

Un detalle del CSS que conviene conocer antes de tocarlo: `--tinta`, `--tinta2` y `--tinta3` se
**redefinen dentro de las tarjetas**. Sobre el fieltro son claras; dentro de una carta crema, oscuras.
Como las variables CSS se heredan, todo el `style="color:var(--tinta3)"` que ya había en el JS
siguió funcionando sin tocarlo y se lee bien en los dos fondos.

### La mesa viva (`web/efectos.js`)

Fichas y naipes en SVG flotando de fondo (se pueden **arrastrar**), paralaje con el ratón y
el scroll, tarjetas que entran **repartidas** con retraso escalonado, inclinación 3D con brillo
que sigue al cursor, barras 1X2 que se llenan y un destello que recorre el filo dorado del hero.

Todo es decorado: si `efectos.js` no carga, la página funciona igual. Se apaga solo si el sistema
pide menos movimiento, y hay un **interruptor en el pie** para apagarlo a mano (se recuerda).

Dos reglas que salieron de tropezar:

- **Solo se animan `transform` y `opacity`.** Un `filter: drop-shadow` sobre 13 piezas que animan
  y un `mix-blend-mode` por tarjeta congelaron la pestaña la primera vez. La sombra de las fichas
  va pintada dentro del SVG y el brillo es un blanco translúcido, sin mezcla.
- **Las tarjetas arrancan invisibles y las revela un IntersectionObserver**, así que hay una red de
  seguridad a los 2.5 s: si el observador no disparara, el decorado estaría escondiendo el contenido.

Y un detalle de CSS que costó encontrar: `.tarjeta.partido.por-repartir` lleva tres clases y le
ganaba a `.tarjeta.repartida`, que lleva dos, así que las tarjetas se quedaban torcidas para
siempre. Se desempata con una regla de la misma especificidad.

Los escudos de los 18 equipos y sus colores salen de la API pública de ESPN (`escudos.py`) y van
incrustados en la página, así que funciona sin internet.

## Qué muestra

- **El torneo completo**: las 17 jornadas con sus partidos. Las jugadas con marcador; las que faltan,
  con probabilidades. La liguilla aparece vacía hasta que se defina.
- **Cómo llega cada equipo**: últimos 5, racha, puntos y goles recientes, rendimiento de local y de
  visitante, días de descanso, porcentaje de sus partidos con más de 2.5 goles y con ambos anotan.
- **Cara a cara** con los marcadores de los duelos anteriores.
- **Clima del estadio** (temperatura, lluvia, viento, humedad y altitud) para los partidos cercanos.
- **Noticias de la semana** por equipo, con señales detectadas en los titulares: bajas, lesiones,
  castigos, cambio de técnico, refuerzos, crisis y ambiente de la afición.
- **Parlays sugeridos**: arma todas las combinaciones posibles de la jornada (una apuesta por
  partido, nunca dos del mismo para no caer en la correlación) y las ordena **por probabilidad**,
  por pago o por valor. Cada sugerencia muestra la probabilidad, la cuota justa y, si escribiste
  tus cuotas, el valor esperado. Un botón la carga en tu parlay.
- **Ajuste manual**: mueves los goles esperados de cada equipo según lo que tú sepas (una baja clave,
  cancha pesada, un equipo sin nada en juego) y todas las probabilidades y el parlay se recalculan.
- **Tabla general**, fuerza de cada equipo y **peso de su casa** (puntos de local menos de visitante:
  la versión medible de que la afición cuenta).

## De dónde salen los datos

- **football-data.co.uk** (`MEX.csv`): 4,725 partidos desde 2012 **con cuotas de cierre**
  (Pinnacle, Bet365, promedio y máxima del mercado). Es la parte valiosa: permite comparar
  al modelo contra el mercado, que es el rival difícil.
- **football-data.co.uk** (`new_league_fixtures.csv`): próxima jornada con cuotas actuales
  (se publican unos días antes de cada jornada; mientras tanto puedes escribir las de tu casa a mano).
- **ESPN** (API pública, sin llave): calendario completo del torneo, resultados, sedes y forma reciente.
- **Open-Meteo** (sin llave): pronóstico y archivo histórico del clima en cada estadio.
- **Google News RSS** (español, México): titulares por equipo de los últimos 7 días.

Todo se descarga solo a `datos/`.

## Cómo funciona

1. **Modelo Dixon-Coles** (`modelo.py`). Cada equipo tiene fuerza de ataque y de defensa; de ahí
   salen los goles esperados de local y visitante y la probabilidad de **cada marcador exacto**.
   La corrección Dixon-Coles arregla los marcadores bajos (0-0, 1-0, 1-1), que la Poisson simple
   subestima. Los partidos viejos pesan menos (decaimiento exponencial).
2. **Todos los mercados salen de la misma tabla de marcadores**: 1X2, doble oportunidad,
   más/menos goles y ambos anotan. Por eso son coherentes entre sí.
3. **Validación caminando en el tiempo** (`validacion.py`, `backtest.py`): para cada jornada el
   modelo solo ve partidos anteriores y se reajusta cada semana. Se mide con log-loss, Brier y
   calibración, contra el mercado. El decaimiento se elige con 2016-2021 y se evalúa con 2021 en adelante.
4. **Simulación de apuestas**: apuesta cuando la probabilidad del modelo supera lo que paga la mejor
   cuota disponible por más del umbral, con Kelly fraccionado (25%) y tope de 5% de la banca.

## Resultado de la validación (lo importante)

Periodo de prueba **2021-07-23 a 2026-09-16**, 1769 partidos, sin mirar el futuro:

| | log-loss | Brier | acierto |
|---|---|---|---|
| Modelo solo | 1.0242 | 0.6139 | 49.0% |
| Mercado (cuota sin margen) | **1.0024** | **0.5992** | **50.5%** |
| Mezcla (5% modelo) | 1.0028 | 0.5994 | 50.3% |

**El modelo no le gana al mercado.** Está bien calibrado (cuando dice 35%, pasa ~34% de las veces),
pero el mercado predice mejor. Apostando con sus señales la banca cae de 100 a 1.5
(retorno medio -9.4% por apuesta, t=-2.38: es pérdida
consistente, no mala racha). El peso óptimo del modelo al mezclarlo con el mercado fue 5%.

Por eso el enfoque de la página es otro: **usar la línea del mercado como verdad** (se le quita el margen
con el método de Shin) y estirar los goles esperados del modelo hasta reproducirla. Así los mercados que
tu casa sí publica pero esta fuente no —goles, ambos anotan, doble oportunidad— salen coherentes con
esa línea. Ahí es donde el modelo aporta: no en adivinar el 1X2, sino en traducir esa línea a los
demás mercados y en calcular el valor esperado real de una combinación.

## Estrategias probadas (`estrategias.py`)

Con cuotas de cierre reales: cada regla se afina con 2016-2021 y se juzga solo con 2021-2026.

**Lo que tiene evidencia**
1. **Buscar siempre la mejor cuota.** La misma apuesta, con la mejor cuota disponible en vez de la
   promedio, mejora de 2 a 8 puntos de yield. Es la palanca más grande y la más segura.
2. **Favoritos (cuota < 2.5) que paguen al menos 2% más que la línea justa de Pinnacle:**
   +14.3% en prueba (159 apuestas, t=1.85), positiva en los 5 años. Prometedora, no demostrada.
3. **Parlays: pocas piernas y de favoritos.** A cuota promedio: 2 piernas −1.6%, 3 piernas −2.8%, 4 piernas −6.9%.

**Lo que pierde seguro:** sorpresas con cuota 3-5 (−9.9%, t=−4.7), cuota 5-10 (−22.6%), parlays largos,
y apostar con el modelo solo (−9.4%).

## ¿Qué factores le agregan algo al mercado? (`analisis_contexto.py`)

Con la probabilidad de Pinnacle como base, se prueba si algo la mejora:
forma reciente (p=0.95: nada), el modelo (p=0.85: nada), viaje (nada), descanso (ruido que empeora
fuera de muestra) y **altitud** (p≈0.05: única pista, creíble pero sin demostrar). Fuera de muestra
nada mejora al mercado más de 0.06%. Traducción: si vienen de ganar o de perder, **la cuota ya lo sabe**.

El arbitraje entre casas se está extinguiendo (47% de partidos en 2016, 7% en 2026, ganancia mediana <1%).

Cada vez que actualizas se guarda una foto de las cuotas en `datos/cuotas_historial/`: en unas semanas
permitirá medir el movimiento de línea (apertura contra cierre).

## ¿Influyen el clima, la afición y las noticias?

**Clima** (`analisis_clima.py`, 3,324 partidos con el clima real del estadio a la hora del partido):
los goles casi no cambian (sin lluvia 2.68, con lluvia 2.74, lluvia fuerte 2.84). Encima de lo que esperaba
el modelo no hay nada significativo; encima de la cuota, una sola señal débil que cabe en el azar.

**Afición** (`analisis_aficion.py`): en la pandemia, sin público, los locales ganaron **más**
(47.8% contra 44.7%)
y la cuota esperaba lo contrario. Con estadio lleno el local ganó menos de lo que decía la cuota. El peso de
la casa de cada equipo ya está en la cuota. La ventaja de local en Liga MX viene más de viaje y altitud.

**Noticias**: no hay archivo histórico de titulares, así que no se pueden probar hacia atrás. Desde ahora
se guardan cada día (`datos/noticias_historial/`) junto con las cuotas, para medirlas en una temporada.

## Monte Carlo (`montecarlo.py`)

- **Torneo**: 20,000 simulaciones de lo que falta, sorteando marcadores exactos y con incertidumbre en
  la fuerza de los equipos. Da puntos esperados, probabilidad de liderato, top 6, play-in, liguilla,
  semis, final y campeonato (formato supuesto: 1-6 directo, 7-10 play-in, ida y vuelta).
- **Qué está en juego** en cada partido de las próximas dos jornadas: la probabilidad de liguilla de
  cada equipo si gana, empata o pierde.
- **Banca**: remuestrea apuestas reales de cada estrategia para ver el abanico de resultados en 150
  apuestas (probabilidad de terminar arriba, rango, riesgo de perder la mitad).

## Otros modelos y sistemas, calificados (`comparativa.py`)

Todos predicen cada partido viendo solo lo anterior y se califican sobre los mismos
1494 partidos (2021-07-23 a 2025-10-27) con RPS, la métrica estándar (menor es mejor):

| Modelo / sistema | RPS | Nota |
|---|---|---|
| Mercado · Pinnacle sin margen | 0.2023 | la vara a vencer |
| Ensamble de 9 modelos (goles + Elo + pi) | 0.2079 | mejor modelo puro, **lo que usa la página** |
| Nuestro Dixon-Coles | 0.2087 | |
| 6 modelos de penaltyblog (Poisson, DC, bivariado, bin. negativa, cero-inflado, Weibull) | 0.2087–0.2089 | prácticamente iguales entre sí |
| Elo | 0.2100 | |
| Pi-ratings (Constantinou y Fenton, 2013) | 0.2168 | el peor |
| FiveThirtyEight SPI (predicciones reales archivadas, 1283 partidos) | 0.2148 | **igual que nuestro Dixon-Coles** (0.2148) y peor calibrado |

Ningún modelo le gana al mercado. Los modelos de goles dicen casi lo mismo entre sí; el ensamble
mejora solo porque Elo y pi-ratings ven al equipo de otra forma. Como Elo y pi no dan marcadores, el
ensamble fija el 1X2 y se estiran los goles esperados hasta reproducirlo (la misma pieza que ancla a
la línea del mercado), así goles y ambos anotan salen coherentes.

**Estrategia de Kaunitz, Zhong y Kreiner (2017)** ("Beating the bookies with their own numbers"):
probabilidad real = 1/promedio de cuotas; apostar a la mejor cuota si supera 1/(prob − α).
En Liga MX con α=0.03: +4.8% en afinado y +9.4% en prueba
(497 apuestas, t=1.4). Positiva en ambos periodos, como en su estudio; aún sin significancia.
La página la muestra como segunda señal ("✓ Kaunitz").

Sitios de pronósticos (Forebet, FootyStats, Vitibet, Dimers, Squawka): sin historial descargable ni
método verificable; no se pueden calificar en serio.

## Simulador de parlays (`simulador.py`)

Cada jornada el sistema aparta **$100 virtuales** en el parlay de **mayor probabilidad
con 2 piernas** —el mismo que encabeza los sugeridos de la página— y guarda el ticket en
`datos/simulador.json`. Se corre solo dentro de `generar.py`, así que cada `./actualizar.sh`
resuelve lo pendiente y abre el ticket de la jornada siguiente.

Es un libro que **solo crece**. Un ticket se escribe una vez, con las probabilidades que
había antes de que se jugara la jornada, y después solo se resuelve contra el marcador real.
Nunca se reescribe.

**No se rellenaron jornadas viejas**, a propósito. El modelo está ajustado con todo el
histórico, así que hoy ya sabe cómo terminaron: un ticket retroactivo para la jornada 3 no
sería una apuesta sino una trampa. El libro arranca en la primera jornada que estaba por
jugarse.

**Se paga a cuota justa** (1 ÷ probabilidad), porque todavía ninguna casa publica cuotas para
la jornada. A cuota justa el valor esperado es exactamente cero, así que el simulador mide
**solo la suerte**. Con cuotas reales el resultado sería peor, y por cuánto ya lo dice el
backtest: un parlay de 2 piernas rinde −1.6%.

Las piernas se eligen con el mismo código que la página: una apuesta por partido (nunca dos
del mismo, para no caer en la correlación), mercados con probabilidad entre 45% y 95%, las 3
mejores de cada partido. Las probabilidades se derivan de la matriz de marcadores y no del
campo `probabilidades`, porque es lo que hace `probsDe()` en la página; el campo viene del
ensamble y difiere hasta 0.4 puntos, lo bastante para elegir otro parlay.

## Lo que hay que tener claro

- **El parlay multiplica el margen de la casa.** Si cada pierna te quita ~5%, cuatro piernas te
  quitan ~19%. La página te dice el valor esperado real de la combinación.
- **Las piernas del mismo partido están correlacionadas.** Aquí se calcula la probabilidad exacta
  sumando los marcadores que cumplen todas las condiciones, no multiplicando como si fueran
  independientes (que es el error que cobra la casa).
- **El modelo no sabe** de lesiones, expulsiones, rotación por torneos internacionales, clima ni
  motivación. Solo ve goles y fechas.
- Ganarle al mercado de forma sostenida es difícil; el backtest está para medirlo con honestidad,
  no para presumir.

## Archivos

| Archivo | Qué hace |
|---|---|
| `datos.py` | descarga y normaliza los CSV de resultados y cuotas |
| `calendario.py` | calendario del torneo desde ESPN y reconstrucción de las jornadas |
| `estadisticas.py` | forma, racha, descanso, cara a cara y peso de la casa |
| `clima.py` | clima por estadio (Open-Meteo) |
| `noticias.py` | titulares por equipo y señales (bajas, castigos, afición…) |
| `construir_datos.py` | junta todo en el paquete que consume la página |
| `modelo.py` | Dixon-Coles, matriz de marcadores y mercados derivados |
| `validacion.py` | walk-forward, métricas, calibración y simulador de apuestas |
| `backtest.py` | corre la validación completa y guarda `datos/backtest.json` |
| `generar.py` | ajusta con todo el histórico y escribe `web/datos.js` |
| `estrategias.py` | laboratorio de estrategias con separación afinado/prueba |
| `analisis_clima.py` | efecto del clima histórico de cada estadio |
| `analisis_aficion.py` | pandemia, asistencia real y peso de la casa contra la cuota |
| `montecarlo.py` | simulación del torneo, importancia de cada partido y banca |
| `simulador.py` | libro de tickets de $100 por jornada: elige, guarda y resuelve |
| `comparativa.py` | competencia de 15 modelos/sistemas sobre los mismos partidos |
| `analisis_contexto.py` | qué factores le agregan información a la línea del mercado |
| `web/index.html` | portada con los accesos y el vistazo del torneo |
| `web/partidos.html` | jornadas, tarjetas de partido, tabla general y Monte Carlo |
| `web/parlays.html` | sugeridos, armador, estrategias y comparativa de modelos |
| `web/simulador.html` | libro de tickets de $100 por jornada |
| `web/estilo.css` · `web/comun.js` | diseño y lógica compartidos por las cuatro |
| `web/datos.js` | lo único que reescribe `generar.py` |

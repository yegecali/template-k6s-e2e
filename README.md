# template-k6s-e2e

Plantilla de pruebas de rendimiento **end-to-end** para APIs con [k6](https://k6.io).
Un único flujo de usuario (login → navegar → carrito → perfil) se ejecuta con distintos
perfiles de carga (humo, carga, estrés, resistencia y picos) contra distintos ambientes,
cada uno con sus propios datos y objetivos de servicio (SLO).

## Requisitos

- k6 (probado con v2.3.0): `brew install k6`

## Estructura

```
.
├── run.sh                    # Runner: elige tipo de prueba y ambiente, guarda el resumen
├── tests/e2e.js              # Punto de entrada único de k6 (options + default function)
├── config/
│   ├── environments.js       # URL base, SLO y set de datos por ambiente
│   └── test-types.js         # Perfiles de carga: smoke, load, stress, soak, spike
├── src/
│   ├── flows/shop-journey.js # El flujo E2E (aquí adaptas tu API)
│   └── lib/
│       ├── http.js           # apiCall() con tags, checks y manejo seguro de JSON
│       └── utils.js          # pick(), randInt(), thinkTime()
├── data/
│   ├── common/               # Datos compartidos (términos de búsqueda)
│   ├── demo/                 # Usuarios del API de demo (DummyJSON), listos para usar
│   ├── dev/                  # Usuarios de dev (reemplazar)
│   ├── staging/              # Usuarios de staging (reemplazar)
│   └── prod/                 # Usuario sintético de prod (reemplazar)
└── results/                  # Resúmenes JSON de cada corrida (ignorado por git)
```

## Uso rápido

```bash
./run.sh smoke              # humo, ambiente demo (default)
./run.sh load staging       # carga en staging
PEAK_VUS=200 ./run.sh stress dev
SOAK_DURATION=4h ./run.sh soak staging
ALLOW_PROD=true ./run.sh smoke prod
```

`run.sh` acepta cualquier flag adicional de k6 después de los dos primeros argumentos,
por ejemplo `./run.sh load dev --out json=results/raw.json`.

## Tipos de prueba

| Tipo     | Pregunta que responde                                  | Perfil de carga                                                  | Cuándo correrla                  |
|----------|--------------------------------------------------------|------------------------------------------------------------------|----------------------------------|
| `smoke`  | ¿El flujo funciona y el API responde?                  | 1 VU durante 1 min                                               | En cada deploy / antes de otras pruebas |
| `load`   | ¿Aguanta la carga esperada con los SLO?                | Rampa a `PEAK_VUS` (20), 15 min de meseta, bajada                | Antes de un release                |
| `stress` | ¿Hasta dónde escala y cómo se degrada?                 | Escalones 25 % → 200 % de `PEAK_VUS` (100), 3 min cada uno       | Al dimensionar infraestructura     |
| `soak`   | ¿Se mantiene estable durante horas? (resistencia)      | `PEAK_VUS` (30) sostenido `SOAK_DURATION` (2 h)                  | Antes de releases mayores, nightly |
| `spike`  | ¿Soporta un pico brusco y se recupera?                 | Base 10 % → pico 100 % (200) en 30 s → vuelta a base             | Eventos de alto tráfico (ventas, campañas) |

Los valores entre paréntesis son los defaults; sobreescríbelos con `PEAK_VUS` o `SOAK_DURATION`.

## Ambientes y datos

Cada ambiente está en `config/environments.js` y apunta a su carpeta en `data/`:

| Ambiente  | Base URL                              | Datos                  | SLO (p95 / error) | Notas                                  |
|-----------|---------------------------------------|------------------------|-------------------|----------------------------------------|
| `demo`    | `https://dummyjson.com`               | `data/demo/`           | 800 ms / 1 %      | Funciona sin configuración             |
| `dev`     | `https://api.dev.example.com`         | `data/dev/`            | 800 ms / 1 %      | Reemplaza URL y usuarios               |
| `staging` | `https://api.staging.example.com`     | `data/staging/`        | 500 ms / 1 %      | Reemplaza URL y usuarios               |
| `prod`    | `https://api.example.com`             | `data/prod/`           | 500 ms / 0.5 %    | **Protegido**, ver abajo               |

Variables que puedes usar sin tocar código:

- `BASE_URL=https://otro.host` sobreescribe la URL base de cualquier ambiente.
- `TEST_USERNAME` / `TEST_PASSWORD` usan un único usuario en lugar de `data/<ambiente>/users.json`.
  Pensado para CI: guarda las credenciales como secretos y no las commitees.

**Datos:** cada VU toma un usuario del archivo del ambiente en round-robin y lo autentica en el login.
Los `REEMPLAZAR_*` de `dev`, `staging` y `prod` deben sustituirse por usuarios reales de prueba antes de correr.
Si no lo haces, el login falla y verás `login: status 200` en rojo, que es lo esperado.

**Ambiente protegido (`prod`):**
- Requiere `ALLOW_PROD=true`.
- Solo permite `smoke` y `load`. `stress`, `soak` y `spike` se rechazan al inicio.
- Usa usuarios sintéticos y márgenes de SLO más estrictos.

## Umbrales (thresholds)

Se derivan del SLO del ambiente, multiplicados por una tolerancia según el tipo de prueba:

| Tipo                   | Tolerancia | Ejemplo en `staging` (p95 500 ms, error 1 %) |
|------------------------|------------|----------------------------------------------|
| smoke, load, soak      | ×1         | p95 < 500 ms, errores < 1 %                  |
| stress, spike          | ×2.5       | p95 < 1250 ms, errores < 2.5 %               |

Métricas evaluadas:
- `http_req_duration` (p95): latencia de todas las peticiones.
- `http_req_failed`: porcentaje de peticiones fallidas.
- `journey_success`: porcentaje de journeys completos sin error de negocio.

Si un threshold no se cumple, k6 termina con código de salida distinto de cero, lo que sirve para CI.

## Cómo leer el resultado

1. **Thresholds** (sección `THRESHOLDS`): ✓ o ✗ por cada SLO.
2. **Checks** (`checks_succeeded`): validaciones por paso. Un `add_to_cart: status 201` en rojo apunta al paso exacto.
3. **`journey_duration`**: tiempo de un usuario completo (incluye pausas). Es la cifra que vive el usuario.
4. **Por paso:** para medir latencia de un paso puntual, filtra por tag, por ejemplo
   `http_req_duration{step:login}`, o agrega un threshold así en `config/test-types.js`.
5. **Resumen JSON:** cada corrida deja `results/<tipo>-<ambiente>-<fecha>.json` para comparar entre corridas.

En `stress` y `spike` el objetivo es encontrar el punto de quiebre: busca el escalón donde el error o la latencia
empiezan a crecer de forma no lineal, no que todo esté en verde.

## Adaptar a tu API

1. Cambia `config/environments.js`: URLs y SLO reales de cada ambiente.
2. Reemplaza `data/*/users.json` con usuarios de prueba reales.
3. Edita `src/flows/shop-journey.js`: conserva el patrón `group()` + `apiCall()` y ajusta paths, bodies y checks.
4. Si el flujo necesita datos dinámicos (ids, SKUs), agrégalos a `data/common/` y cárgalos con `SharedArray` en `tests/e2e.js`.
5. Usa `name` en `apiCall()` para rutas con parámetros (`/orders/:id`), así las métricas no explotan en cardinalidad.

## Integración con CI (ejemplo)

```yaml
- name: Smoke de rendimiento en staging
  env:
    TEST_USERNAME: ${{ secrets.K6_USERNAME }}
    TEST_PASSWORD: ${{ secrets.K6_PASSWORD }}
  run: ./run.sh smoke staging
- uses: actions/upload-artifact@v4
  if: always()
  with:
    name: k6-results
    path: results/
```

Requiere k6 instalado en el runner (por ejemplo con `grafana/setup-k6-action`).

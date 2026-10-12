// Perfiles de carga por tipo de prueba.
//
//   smoke   -> 1 VU, humo: ¿el flujo funciona? Corre rápido, se ejecuta en cada deploy.
//   load    -> carga esperada: rampa hasta PEAK_VUS, se sostiene y baja.
//   stress  -> rampas escalonadas por encima de la carga esperada hasta encontrar el punto de quiebre.
//   soak    -> resistencia: carga moderada sostenida por largo tiempo (fugas de memoria, degradación).
//   spike   -> picos bruscos y recuperación.
//
// Variables de entorno que afectan el perfil:
//   PEAK_VUS       VUs máximos del perfil (cada tipo tiene un default razonable)
//   SOAK_DURATION  duración de la meseta en soak (default 2h), ej: 30m, 4h

const DEFAULT_PEAK = { load: 20, stress: 100, soak: 30, spike: 200 };

// Multiplicador de tolerancia sobre los SLO del ambiente.
// Stress y spike esperan degradación: el objetivo es observar, no pasar en verde.
const TOLERANCE = { smoke: 1, load: 1, soak: 1, stress: 2.5, spike: 2.5 };

const PROFILES = {
  smoke: () => ({ vus: 1, duration: '1m' }),

  load: (peak) => ({
    stages: [
      { duration: '5m', target: peak },
      { duration: '15m', target: peak },
      { duration: '2m', target: 0 },
    ],
  }),

  stress: (peak) => {
    const steps = [0.25, 0.5, 0.75, 1, 1.5, 2].map((f) => ({
      duration: '3m',
      target: Math.round(peak * f),
    }));
    return { stages: [...steps, { duration: '2m', target: 0 }] };
  },

  soak: (peak) => ({
    stages: [
      { duration: '5m', target: peak },
      { duration: __ENV.SOAK_DURATION || '2h', target: peak },
      { duration: '5m', target: 0 },
    ],
  }),

  spike: (peak) => {
    const base = Math.max(1, Math.round(peak * 0.1));
    return {
      stages: [
        { duration: '2m', target: base },
        { duration: '30s', target: peak },
        { duration: '1m', target: peak },
        { duration: '30s', target: base },
        { duration: '3m', target: base },
        { duration: '30s', target: 0 },
      ],
    };
  },
};

export const TEST_TYPES = Object.keys(PROFILES);

function thresholdsFor(type, env) {
  const t = TOLERANCE[type];
  const { p95Ms, errorRate } = env.slo;
  const allowedErrors = Math.min(1, errorRate * t);
  return {
    http_req_duration: [`p(95)<${Math.round(p95Ms * t)}`],
    http_req_failed: [`rate<${allowedErrors}`],
    journey_success: [`rate>${1 - allowedErrors}`],
  };
}

export function buildOptions(type, env) {
  const build = PROFILES[type];
  if (!build) {
    throw new Error(`TEST_TYPE inválido "${type}". Opciones: ${TEST_TYPES.join(', ')}`);
  }
  if (env.protected && !['smoke', 'load'].includes(type)) {
    throw new Error(`En "${env.name}" solo se permiten smoke y load (recibido: ${type}).`);
  }
  if (env.protected && __ENV.ALLOW_PROD !== 'true') {
    throw new Error(`"${env.name}" es un ambiente protegido. Define ALLOW_PROD=true para continuar.`);
  }

  const peak = Number(__ENV.PEAK_VUS) || DEFAULT_PEAK[type];
  const profile = build(peak);

  return {
    ...profile,
    thresholds: thresholdsFor(type, env),
    summaryTrendStats: ['avg', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
    tags: { test_type: type, environment: env.name },
  };
}

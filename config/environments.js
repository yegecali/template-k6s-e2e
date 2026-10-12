// Configuración por ambiente.
// Cada ambiente define a qué API apuntar, qué set de datos usar y los SLO
// (objetivos de servicio) contra los que se evalúan las pruebas.
//
// Override rápido: BASE_URL=https://otro.host sobreescribe baseUrl en cualquier ambiente.

const ENVIRONMENTS = {
  // Demo público (DummyJSON). Sirve para validar el proyecto end-to-end sin infraestructura propia.
  demo: {
    name: 'demo',
    baseUrl: 'https://dummyjson.com',
    dataDir: 'demo',
    thinkTime: [1, 3], // segundos de "pausa" entre journeys (simula al usuario real)
    slo: { p95Ms: 800, errorRate: 0.01 },
  },
  dev: {
    name: 'dev',
    baseUrl: 'https://api.dev.example.com',
    dataDir: 'dev',
    thinkTime: [1, 3],
    slo: { p95Ms: 800, errorRate: 0.01 },
  },
  staging: {
    name: 'staging',
    baseUrl: 'https://api.staging.example.com',
    dataDir: 'staging',
    thinkTime: [1, 3],
    slo: { p95Ms: 500, errorRate: 0.01 },
  },
  prod: {
    name: 'prod',
    baseUrl: 'https://api.example.com',
    dataDir: 'prod',
    thinkTime: [2, 5],
    slo: { p95Ms: 500, errorRate: 0.005 },
    // Ambiente protegido: solo smoke y load, y requiere ALLOW_PROD=true (ver test-types.js).
    protected: true,
  },
};

export function getEnvironment(name) {
  const base = ENVIRONMENTS[name];
  if (!base) {
    throw new Error(`Ambiente desconocido "${name}". Opciones: ${Object.keys(ENVIRONMENTS).join(', ')}`);
  }
  return { ...base, baseUrl: __ENV.BASE_URL || base.baseUrl };
}

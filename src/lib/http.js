import http from 'k6/http';
import { check } from 'k6';

// Llamada HTTP genérica para la API.
// - `step` etiqueta la petición (aparece en métricas y thresholds: http_req_duration{step:login}).
// - `name` agrupa URLs con parámetros para evitar cardinalidad infinita (ej: '/products/:id').
export function apiCall({ baseUrl, method = 'GET', path, body, token, step, name, expectStatus = 200 }) {
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = http.request(method, `${baseUrl}${path}`, body !== undefined ? JSON.stringify(body) : null, {
    headers,
    tags: { step, name: name || path.split('?')[0] },
  });

  check(res, { [`${step}: status ${expectStatus}`]: (r) => r.status === expectStatus });
  return res;
}

// Lee un campo del JSON sin lanzar excepción si la respuesta no es JSON válido.
export function safeJson(res, selector) {
  try {
    return res.json(selector);
  } catch (_) {
    return undefined;
  }
}

import { check, group } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';
import exec from 'k6/execution';
import { apiCall, safeJson } from '../lib/http.js';
import { pick, randInt, thinkTime } from '../lib/utils.js';

// Métricas de negocio, además de las nativas de k6 (http_req_*).
const journeyDuration = new Trend('journey_duration', true);
const journeySuccess = new Rate('journey_success');
const businessErrors = new Counter('business_errors');

// Un "journey" es una sesión completa de usuario:
// login -> buscar/ver producto -> agregar al carrito -> revisar carrito -> perfil.
// Para adaptarlo a tu API, cambia los pasos de runSteps() y deja el resto igual.
export function shopJourney({ env, users, searchTerms }) {
  const started = Date.now();
  const ok = runSteps(env, users, searchTerms);
  journeyDuration.add(Date.now() - started);
  journeySuccess.add(ok);
  thinkTime(env.thinkTime);
}

function runSteps(env, users, searchTerms) {
  const base = env.baseUrl;
  // Round-robin determinista sobre los usuarios del ambiente.
  const user = users[exec.scenario.iterationInTest % users.length];

  // 1. Autenticación
  const session = group('01_login', () => {
    const res = apiCall({
      baseUrl: base,
      method: 'POST',
      path: '/auth/login',
      body: { username: user.username, password: user.password, expiresInMins: 30 },
      step: 'login',
    });
    if (res.status !== 200) return null;
    return { token: safeJson(res, 'accessToken'), userId: safeJson(res, 'id') };
  });
  if (!session || !session.token) {
    businessErrors.add(1);
    return false;
  }

  // 2. Navegación: listado, búsqueda y detalle de un producto al azar
  const product = group('02_browse', () => {
    const list = apiCall({
      baseUrl: base,
      path: '/products?limit=10',
      name: '/products',
      token: session.token,
      step: 'list_products',
    });
    apiCall({
      baseUrl: base,
      path: `/products/search?q=${encodeURIComponent(pick(searchTerms))}`,
      name: '/products/search',
      token: session.token,
      step: 'search_products',
    });

    const items = safeJson(list, 'products') || [];
    if (items.length === 0) return null;

    const choice = pick(items);
    const detail = apiCall({
      baseUrl: base,
      path: `/products/${choice.id}`,
      name: '/products/:id',
      token: session.token,
      step: 'product_detail',
    });
    return detail.status === 200 ? choice : null;
  });
  if (!product) {
    businessErrors.add(1);
    return false;
  }

  // 3. Agregar al carrito y validar la respuesta de negocio (total > 0)
  const cartOk = group('03_cart', () => {
    const res = apiCall({
      baseUrl: base,
      method: 'POST',
      path: '/carts/add',
      body: { userId: session.userId, products: [{ id: product.id, quantity: randInt(1, 3) }] },
      token: session.token,
      step: 'add_to_cart',
      expectStatus: 201, // creación de recurso
    });
    return check(res, { 'add_to_cart: total > 0': (r) => safeJson(r, 'total') > 0 });
  });

  // 4. Revisar carrito del usuario
  const reviewOk = group('04_cart_review', () => {
    const res = apiCall({
      baseUrl: base,
      path: `/carts/user/${session.userId}`,
      name: '/carts/user/:id',
      token: session.token,
      step: 'user_carts',
    });
    return check(res, { 'user_carts: has carts': (r) => (safeJson(r, 'carts') || []).length > 0 });
  });

  // 5. Perfil del usuario autenticado
  group('05_profile', () => {
    apiCall({ baseUrl: base, path: '/auth/me', token: session.token, step: 'me' });
  });

  const ok = cartOk && reviewOk;
  if (!ok) businessErrors.add(1);
  return ok;
}

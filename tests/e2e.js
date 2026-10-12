// Punto de entrada único. Se controla con variables de entorno:
//   TEST_TYPE      smoke | load | stress | soak | spike   (default: smoke)
//   TEST_ENV       demo | dev | staging | prod             (default: demo)
//   TEST_USERNAME  usuario único opcional (sobrescribe data/<ambiente>/users.json; útil en CI con secretos)
//   TEST_PASSWORD  password del usuario anterior
//   BASE_URL, PEAK_VUS, SOAK_DURATION, ALLOW_PROD: ver config/*.js
import { SharedArray } from 'k6/data';
import { getEnvironment } from '../config/environments.js';
import { buildOptions } from '../config/test-types.js';
import { shopJourney } from '../src/flows/shop-journey.js';

const testType = __ENV.TEST_TYPE || 'smoke';
const env = getEnvironment(__ENV.TEST_ENV || 'demo');

export const options = buildOptions(testType, env);

// SharedArray: los datos se cargan una vez y se comparten entre VUs (poca memoria).
const users = new SharedArray('users', () => {
  if (__ENV.TEST_USERNAME) {
    return [{ username: __ENV.TEST_USERNAME, password: __ENV.TEST_PASSWORD }];
  }
  return JSON.parse(open(`../data/${env.dataDir}/users.json`)).users;
});

const searchTerms = new SharedArray('search-terms', () => JSON.parse(open('../data/common/search-terms.json')).terms);

export default function () {
  shopJourney({ env, users, searchTerms });
}

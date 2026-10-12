import { sleep } from 'k6';

export function pick(items) {
  return items[Math.floor(Math.random() * items.length)];
}

export function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Pausa de "pensar" del usuario entre acciones, en segundos.
export function thinkTime([min, max]) {
  sleep(min + Math.random() * (max - min));
}

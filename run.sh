#!/usr/bin/env bash
# Uso: ./run.sh <smoke|load|stress|soak|spike> [demo|dev|staging|prod] [-- args extra de k6]
# Ejemplos:
#   ./run.sh smoke
#   ./run.sh load staging
#   PEAK_VUS=200 ./run.sh stress dev
#   SOAK_DURATION=4h ./run.sh soak staging
#   ALLOW_PROD=true ./run.sh smoke prod
set -euo pipefail

cd "$(dirname "$0")"

TYPE="${1:-smoke}"
TEST_ENV="${2:-demo}"
shift $(( $# < 2 ? $# : 2 ))

case "$TYPE" in
  smoke|load|stress|soak|spike) ;;
  *) echo "Tipo de prueba inválido: $TYPE (usa smoke|load|stress|soak|spike)" >&2; exit 1 ;;
esac

mkdir -p results
STAMP="$(date +%Y%m%d-%H%M%S)"
SUMMARY="results/${TYPE}-${TEST_ENV}-${STAMP}.json"

echo "▶ tipo=${TYPE} ambiente=${TEST_ENV} resumen=${SUMMARY}"
exec k6 run \
  -e TEST_TYPE="$TYPE" \
  -e TEST_ENV="$TEST_ENV" \
  --summary-export "$SUMMARY" \
  "$@" \
  tests/e2e.js

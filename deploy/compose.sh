#!/usr/bin/env bash
# Lance docker compose avec le fichier de production et ses variables.
#   deploy/compose.sh up -d --build
#   deploy/compose.sh run --rm tools npx prisma migrate deploy
#
# Variables facultatives :
#   GESTBIBLIO_DIR      dossier du projet (défaut : parent de ce script)
#   GESTBIBLIO_ENV      fichier d'environnement (défaut : $GESTBIBLIO_DIR/.env.production)
#   GESTBIBLIO_PROJECT  nom du projet compose (défaut : gestbiblio)
#   GESTBIBLIO_COMPOSE_EXTRA  fichier compose supplémentaire (réglages propres au
#                       serveur, ex. autres ports), appliqué après le fichier de production
set -euo pipefail

DIR="${GESTBIBLIO_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
ENV_FILE="${GESTBIBLIO_ENV:-$DIR/.env.production}"
PROJECT="${GESTBIBLIO_PROJECT:-gestbiblio}"
FILES=(-f "$DIR/docker-compose.prod.yml")
[[ -n "${GESTBIBLIO_COMPOSE_EXTRA:-}" ]] && FILES+=(-f "$GESTBIBLIO_COMPOSE_EXTRA")

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Erreur : fichier d'environnement introuvable : $ENV_FILE" >&2
  exit 2
fi

# Lu par docker-compose.prod.yml (env_file des services app et tools).
export GESTBIBLIO_ENV_FILE="$ENV_FILE"

exec docker compose --project-name "$PROJECT" --project-directory "$DIR" \
  --env-file "$ENV_FILE" "${FILES[@]}" "$@"

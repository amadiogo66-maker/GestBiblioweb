#!/usr/bin/env bash
# Test de restauration : restaure une sauvegarde dans une base TEMPORAIRE du
# même serveur PostgreSQL, compare les comptages, puis supprime la base.
# La base de production n'est jamais modifiée.
#
#   deploy/restore-db.sh /var/backups/gestbiblio/gestbiblio-20260101T020000Z.dump[.age|.gpg]
#   deploy/restore-db.sh <fichier> --keep     → garde la base temporaire pour inspection
#
# Fichier chiffré : BACKUP_AGE_IDENTITY (fichier de clé privée age) ou gpg
# (clé privée dans le trousseau). La clé privée ne doit pas rester sur le serveur.
#
# Comparaison : avec le fichier .counts écrit au moment de la sauvegarde (même
# nom, extension .counts). Écart ou erreur → code de sortie non nul.
#
# Codes de sortie : 0 restauration conforme ; 1 écart de comptage ; 2 usage ;
# 3 déchiffrement ; 4 restauration.
set -Eeuo pipefail
umask 077

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE="$SCRIPT_DIR/compose.sh"
FILE="${1:-}"
KEEP="${2:-}"

[[ -n "$FILE" && -f "$FILE" ]] || { echo "Usage : $0 <sauvegarde> [--keep]" >&2; exit 2; }

TMPDIR_RESTORE="$(mktemp -d)"
TEMP_DB="gestbiblio_restore_$(date -u +%Y%m%d%H%M%S)"
cleanup() {
  rm -rf "$TMPDIR_RESTORE"
  if [[ "$KEEP" != "--keep" ]]; then
    "$COMPOSE" exec -T -e TEMP_DB="$TEMP_DB" postgres sh -c 'dropdb -U "$POSTGRES_USER" --if-exists "$TEMP_DB"' > /dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

COUNTS_FILE="${FILE%.age}"; COUNTS_FILE="${COUNTS_FILE%.gpg}"; COUNTS_FILE="${COUNTS_FILE%.dump}.counts"
DUMP="$FILE"
case "$FILE" in
  *.age)
    [[ -n "${BACKUP_AGE_IDENTITY:-}" ]] || { echo "BACKUP_AGE_IDENTITY requis pour un fichier .age" >&2; exit 3; }
    DUMP="$TMPDIR_RESTORE/backup.dump"
    age -d -i "$BACKUP_AGE_IDENTITY" -o "$DUMP" "$FILE" || { echo "Déchiffrement age impossible" >&2; exit 3; } ;;
  *.gpg)
    DUMP="$TMPDIR_RESTORE/backup.dump"
    gpg --batch --yes -o "$DUMP" --decrypt "$FILE" || { echo "Déchiffrement gpg impossible" >&2; exit 3; } ;;
esac

echo "Base temporaire : $TEMP_DB"
"$COMPOSE" exec -T -e TEMP_DB="$TEMP_DB" postgres sh -c 'createdb -U "$POSTGRES_USER" "$TEMP_DB"' \
  || { echo "Création de la base temporaire impossible" >&2; exit 4; }
"$COMPOSE" exec -T -e TEMP_DB="$TEMP_DB" postgres sh -c \
  'pg_restore -U "$POSTGRES_USER" -d "$TEMP_DB" --no-owner --no-privileges --exit-on-error' < "$DUMP" \
  || { echo "pg_restore a échoué" >&2; exit 4; }

RESTORED="$TMPDIR_RESTORE/restored.counts"
"$SCRIPT_DIR/db-counts.sh" "$TEMP_DB" > "$RESTORED" || { echo "Comptage de la base restaurée impossible" >&2; exit 4; }

echo "Comptages de la base restaurée :"
sed 's/^/  /' "$RESTORED"

if [[ ! -f "$COUNTS_FILE" ]]; then
  echo "Aucun fichier de comptage ($COUNTS_FILE) : comparaison impossible, restauration seule vérifiée."
  exit 0
fi

if diff -u "$COUNTS_FILE" "$RESTORED" > "$TMPDIR_RESTORE/diff"; then
  echo "Conforme : comptages identiques à ceux de la sauvegarde."
  [[ "$KEEP" == "--keep" ]] && echo "Base conservée : $TEMP_DB (à supprimer avec dropdb)."
  exit 0
fi

echo "ÉCART entre la sauvegarde et la restauration :" >&2
cat "$TMPDIR_RESTORE/diff" >&2
exit 1

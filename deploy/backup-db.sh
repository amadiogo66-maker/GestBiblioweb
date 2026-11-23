#!/usr/bin/env bash
# Sauvegarde de la base PostgreSQL de production (pg_dump, format custom).
#
#   deploy/backup-db.sh
#
# Configuration (variables d'environnement, ou fichier deploy/backup.env) :
#   BACKUP_DIR              dossier des sauvegardes       (défaut : /var/backups/gestbiblio)
#   BACKUP_RETENTION_DAYS   jours de conservation locale  (défaut : 14)
#   BACKUP_AGE_RECIPIENT    clé publique age (age1...)     → fichier .dump.age
#   BACKUP_GPG_RECIPIENT    destinataire gpg (id ou e-mail) → fichier .dump.gpg
#                           (l'un OU l'autre ; aucun = sauvegarde non chiffrée)
#   BACKUP_OFFSITE_COMMAND  commande de copie hors site, reçoit le fichier en $1, ex. :
#                             rclone copy "$1" distant:gestbiblio/
#                             rsync -a "$1" sauvegarde@serveur2:/srv/gestbiblio/
#   BACKUP_LOG              journal                        (défaut : $BACKUP_DIR/backup.log)
#
# La clé STAFF_MFA_KEY n'est PAS dans la base : la sauvegarder à part.
#
# Codes de sortie : 0 succès ; 2 configuration ; 3 pg_dump ; 4 vérification ;
# 5 chiffrement ; 6 copie hors site.
set -Eeuo pipefail
umask 077

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/dev/null
[[ -f "$SCRIPT_DIR/backup.env" ]] && source "$SCRIPT_DIR/backup.env"

COMPOSE="$SCRIPT_DIR/compose.sh"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/gestbiblio}"
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
BACKUP_LOG="${BACKUP_LOG:-$BACKUP_DIR/backup.log}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
BASE="$BACKUP_DIR/gestbiblio-$STAMP"
PARTIAL="$BASE.dump.partial"

log() { printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" | tee -a "$BACKUP_LOG" >&2; }
fail() { log "ÉCHEC : $2"; rm -f "$PARTIAL" "$BASE.dump" "$BASE.counts"; exit "$1"; }

mkdir -p "$BACKUP_DIR" || { echo "Impossible de créer $BACKUP_DIR" >&2; exit 2; }
[[ "$BACKUP_RETENTION_DAYS" =~ ^[0-9]+$ ]] || fail 2 "BACKUP_RETENTION_DAYS doit être un entier"
if [[ -n "${BACKUP_AGE_RECIPIENT:-}" && -n "${BACKUP_GPG_RECIPIENT:-}" ]]; then
  fail 2 "BACKUP_AGE_RECIPIENT et BACKUP_GPG_RECIPIENT sont exclusifs"
fi
[[ -n "${BACKUP_AGE_RECIPIENT:-}" ]] && ! command -v age > /dev/null && fail 2 "age introuvable"
[[ -n "${BACKUP_GPG_RECIPIENT:-}" ]] && ! command -v gpg > /dev/null && fail 2 "gpg introuvable"

log "Début de la sauvegarde → $BASE"

# 1. Comptage des tables principales (contrôle lors d'une restauration).
"$SCRIPT_DIR/db-counts.sh" > "$BASE.counts" || fail 3 "comptage des lignes impossible"

# 2. Dump au format custom, écrit d'abord dans un fichier partiel.
"$COMPOSE" exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom --no-owner --no-privileges' \
  > "$PARTIAL" || fail 3 "pg_dump a échoué"
[[ -s "$PARTIAL" ]] || fail 3 "dump vide"

# 3. Vérification : le dump doit être lisible par pg_restore.
"$COMPOSE" exec -T postgres pg_restore --list < "$PARTIAL" > /dev/null || fail 4 "dump illisible par pg_restore"
mv "$PARTIAL" "$BASE.dump"
FILE="$BASE.dump"

# 4. Chiffrement facultatif par clé publique (la clé privée n'est jamais sur ce serveur).
if [[ -n "${BACKUP_AGE_RECIPIENT:-}" ]]; then
  age -r "$BACKUP_AGE_RECIPIENT" -o "$FILE.age" "$FILE" || fail 5 "chiffrement age"
  rm -f "$FILE"; FILE="$FILE.age"
elif [[ -n "${BACKUP_GPG_RECIPIENT:-}" ]]; then
  gpg --batch --yes --trust-model always -r "$BACKUP_GPG_RECIPIENT" -o "$FILE.gpg" --encrypt "$FILE" || fail 5 "chiffrement gpg"
  rm -f "$FILE"; FILE="$FILE.gpg"
fi

log "Sauvegarde écrite : $FILE ($(du -h "$FILE" | cut -f1))"

# 5. Copie hors site facultative.
if [[ -n "${BACKUP_OFFSITE_COMMAND:-}" ]]; then
  bash -c "$BACKUP_OFFSITE_COMMAND" offsite "$FILE" || { log "ÉCHEC : copie hors site"; exit 6; }
  bash -c "$BACKUP_OFFSITE_COMMAND" offsite "$BASE.counts" || { log "ÉCHEC : copie hors site (comptages)"; exit 6; }
  log "Copie hors site faite"
fi

# 6. Rétention locale.
find "$BACKUP_DIR" -maxdepth 1 -type f -name 'gestbiblio-*' -mtime +"$BACKUP_RETENTION_DAYS" -print -delete \
  | while read -r old; do log "Supprimé (rétention) : $old"; done

log "Sauvegarde terminée"

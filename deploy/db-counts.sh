#!/usr/bin/env bash
# Nombre de lignes des tables principales, une ligne "Table nombre" par table.
#   deploy/db-counts.sh            → base de production
#   deploy/db-counts.sh <base>     → autre base du même serveur (ex. base de restauration)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET_DB="${1:-}"
TABLES='User LibraryMember Book Loan Reservation Notification News Attendance ActivityLog SiteEvent StaffAssignment StaffMfa StaffRecoveryCode Faculty Department Program DepartmentAlias _prisma_migrations'

SQL=""
for table in $TABLES; do
  SQL+="SELECT '$table', count(*) FROM \"$table\" UNION ALL "
done
SQL="${SQL% UNION ALL } ORDER BY 1;"

"$SCRIPT_DIR/compose.sh" exec -T -e TARGET_DB="$TARGET_DB" postgres sh -c \
  'psql -X -q -A -t -F " " -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "${TARGET_DB:-$POSTGRES_DB}"' <<< "$SQL"

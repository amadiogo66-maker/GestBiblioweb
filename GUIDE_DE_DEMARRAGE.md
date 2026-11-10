# Démarrage rapide — Gest Biblio Web

## Prérequis

- Node.js 18+
- Docker Desktop (recommandé pour la base de données locale)

## 1. Installer les dépendances

```bash
npm install
```

## 2. Configurer les variables d'environnement

Un fichier `.env` est déjà prêt avec des valeurs par défaut adaptées au docker-compose fourni.
Si besoin, repartez du modèle :

```bash
cp .env.example .env
```

> Le CLI Prisma (`prisma migrate`, `prisma db seed`, ...) ne lit que `.env`, pas `.env.local`.
> Next.js lit les deux, mais gardez `.env` comme fichier de référence pour que les deux outils soient synchronisés.

## 3. Lancer la base de données PostgreSQL

```bash
npm run db:start
```

Démarre le conteneur `gestbiblio-postgres` défini dans `docker-compose.yml` et attend qu'il soit prêt
(`--wait` sur le healthcheck).

> **Port 5433 au lieu de 5432** : le conteneur expose PostgreSQL sur le port **5433** de votre machine
> (`"5433:5432"` dans `docker-compose.yml`) car le port 5432 par défaut était déjà occupé par une autre
> instance PostgreSQL locale. `DATABASE_URL` dans `.env` pointe déjà vers `localhost:5433`. Si votre
> machine n'a pas ce conflit, vous pouvez remettre `"5432:5432"` et `localhost:5432` dans les deux fichiers.

## 4. Générer le client Prisma et appliquer les migrations

```bash
npx prisma generate
npx prisma migrate dev
```

## 5. Charger les données de test

```bash
npm run db:seed
```

Crée 10 ouvrages, 3 actualités, un compte de test, et 5 `LibraryMember` de test :

- **Email / nom d'utilisateur** : `test@test.com` / `test`
- **Mot de passe** : `Test1234!`

### Membres de bibliothèque de test (`LibraryMember`)

L'inscription sur le site (`/inscription`) exige désormais un matricule + une date de naissance
correspondant à un membre déjà connu (poussé normalement par le logiciel de gestion via
`POST /api/members/sync`). En attendant que ce logiciel existe, le seed pré-remplit ces membres :

| Matricule | Nom | Prénom | Date de naissance | Rôle | Département | Actif | Compte web déjà créé ? |
|---|---|---|---|---|---|---|---|
| `ETU-2026-001` | Diallo | Mariama | 12/04/2003 | Étudiant | Informatique | Oui | Non — utilisable pour tester une inscription réussie |
| `ENS-2026-002` | Barry | Ibrahima | 03/09/1978 | Enseignant | Droit | Oui | Non — utilisable pour tester une inscription réussie |
| `ETU-2026-003` | Camara | Fatoumata | 20/01/2000 | Étudiant | Gestion | **Non** | Non — doit être refusé (inscription radiée) |
| `ETU-2026-000` | Test | Étudiant | 15/06/1999 | Étudiant | Informatique | Oui | **Oui** (`test@test.com`) — doit être refusé (déjà rattaché) |
| `VIS-2026-004` | Sow | Aïssatou | 01/12/1990 | Visiteur | — | Oui | Non — utilisable pour tester une inscription réussie |

Pour tester un cas nominal, utilisez par exemple `ETU-2026-001` + `2003-04-12`.

## 6. Lancer le serveur de développement

```bash
npm run dev
```

## 7. Ouvrir dans le navigateur

http://localhost:3000

---

## Scripts utiles

| Commande | Effet |
|---|---|
| `npm run db:start` | Démarre PostgreSQL (Docker) |
| `npm run db:stop` | Arrête PostgreSQL |
| `npm run db:reset` | Supprime les données, relance PostgreSQL, remigre et reseed tout |
| `npm run db:studio` | Ouvre Prisma Studio pour explorer la base |
| `npm run dev` | Lance le site en développement |
| `npm run build` | Build de production |

## Sans Docker

Si Docker Desktop n'est pas disponible, pointez simplement `DATABASE_URL` dans `.env` vers
n'importe quel PostgreSQL 14+ déjà installé (local ou distant), puis reprenez à l'étape 4.

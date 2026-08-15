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

Crée 10 ouvrages, 3 actualités, et un compte de test :

- **Email / nom d'utilisateur** : `test@test.com` / `test`
- **Mot de passe** : `Test1234!`

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

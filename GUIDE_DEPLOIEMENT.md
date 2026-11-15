# Guide de déploiement — démonstration Vercel + Neon

Ce guide décrit le déploiement de démonstration de Gest Biblio Web :

- **Base de données** : PostgreSQL hébergé sur [Neon](https://neon.tech) (offre gratuite)
- **Application** : [Vercel](https://vercel.com), plan Hobby

Les migrations et le seed sont lancés **depuis votre machine**, jamais pendant le build Vercel.
Votre fichier `.env` local n'est **pas modifié** : l'URL Neon est définie temporairement dans la
session `cmd`.

> Toutes les commandes ci-dessous sont à taper dans **cmd** (Invite de commandes), pas PowerShell.

---

## 1. Créer la base Neon

1. Créez un compte puis un projet sur Neon.
   - Région : choisissez **la même région que les fonctions Vercel** (par défaut Vercel utilise
     `iad1` / Washington D.C. ; sur Neon, prenez `AWS us-east-1`). Sinon chaque requête traverse
     l'Atlantique.
   - Version PostgreSQL : 16 ou 17.
2. Dans le tableau de bord Neon, ouvrez **Connect**. Neon fournit deux chaînes de connexion :

   | Usage | Option dans Neon | Reconnaissable à |
   |---|---|---|
   | **Application (Vercel)** | *Connection pooling* **activé** | l'hôte contient `-pooler` |
   | **Migrations + seed (votre machine)** | *Connection pooling* **désactivé** | pas de `-pooler` dans l'hôte |

   Exemple (valeurs fictives) :

   ```
   Pooled : postgresql://USER:PASSWORD@ep-xxx-123456-pooler.us-east-1.aws.neon.tech/neondb?sslmode=require
   Direct : postgresql://USER:PASSWORD@ep-xxx-123456.us-east-1.aws.neon.tech/neondb?sslmode=require
   ```

   Conservez les deux. Elles contiennent un mot de passe : ne les committez jamais.

---

## 2. Appliquer les migrations et le seed depuis votre machine

Ouvrez **cmd** et placez-vous dans le projet :

```bat
cd /d "C:\Mes projets\GestBiblioWeb"
```

Définissez l'URL **directe** Neon pour cette session uniquement. Les guillemets entourent
**toute** l'affectation : c'est indispensable car l'URL contient `&` ou `?`, que cmd interprète
sinon.

```bat
set "DATABASE_URL=postgresql://USER:PASSWORD@ep-xxx-123456.us-east-1.aws.neon.tech/neondb?sslmode=require"
```

Optionnel : choisir le mot de passe du compte de test (sinon `Test1234!`) :

```bat
set "SEED_TEST_PASSWORD=UnMotDePasseDeDemo!"
```

Vérifiez que la variable pointe bien vers Neon et non vers `localhost` :

```bat
echo %DATABASE_URL%
```

Appliquez les migrations (sans créer de nouvelle migration, sans réinitialiser) :

```bat
npx prisma migrate deploy
```

Attendu : `All migrations have been successfully applied.` (3 migrations).

Puis le seed :

```bat
npm run db:seed
```

Le seed est **rejouable** : livres, membres et réglages sont mis à jour par `upsert`, les
actualités de démonstration sont supprimées puis recréées, et le mot de passe du compte de test
est réécrit à chaque exécution.

Optionnel, livres de démonstration supplémentaires :

```bat
npm run db:demo-books
```

Fermez ensuite la fenêtre cmd (ou tapez `set DATABASE_URL=`) : la variable disparaît et votre
`.env` local reprend la main.

> Une variable définie dans la session est prioritaire sur `.env` : Prisma ne l'écrase pas.

---

## 3. Déployer sur Vercel

### 3.1 Importer le projet

1. Poussez le dépôt sur GitHub (vérifiez que `.env` n'est **pas** suivi : `git ls-files .env`
   ne doit rien afficher).
2. Sur Vercel : **Add New… → Project**, importez le dépôt.
3. Framework : **Next.js** (détecté automatiquement). Laissez les commandes par défaut :
   - Install : `npm install` (déclenche `postinstall` → `prisma generate`)
   - Build : `npm run build`
   - Output : par défaut
4. Node.js : 20.x ou 22.x (Settings → General → Node.js Version).

### 3.2 Variables d'environnement

Dans **Settings → Environment Variables**, environnement **Production** (et Preview si vous
l'utilisez) :

| Nom | Secret | Valeur |
|---|---|---|
| `DATABASE_URL` | oui | URL **pooled** Neon (avec `-pooler`) |
| `NEXTAUTH_SECRET` | oui | Chaîne aléatoire : `npx auth secret` ou `openssl rand -base64 32`. **Différente** de celle de votre `.env` local |
| `GEST_BIBLIO_API_KEY` | oui | Optionnel. Clé des webhooks `/api/*/sync`. Sans elle, ces routes répondent 500 |

À **ne pas** définir sur Vercel :

- `NEXTAUTH_URL` / `AUTH_URL` : l'application utilise `trustHost: true`, et Vercel transmet
  l'hôte réel. Définir cette variable (surtout avec `http://localhost:3000`) casserait les
  redirections de connexion et les déploiements Preview.
- `SEED_TEST_PASSWORD` : le seed ne tourne jamais sur Vercel.
- `NODE_ENV` : Vercel le positionne lui-même à `production`.

Les autres variables de `.env.example` (`GEST_BIBLIO_API_URL`, `UPLOAD_DIR`, `BREVO_API_KEY`,
`EMAIL_FROM`, `NEXT_PUBLIC_APP_URL`) ne sont pas lues par le code actuel.

### 3.3 Lancer le déploiement

Cliquez **Deploy**. Une variable ajoutée ou modifiée après coup n'est prise en compte qu'après
un **Redeploy** (Deployments → … → Redeploy).

### 3.4 URL du site

Vercel attribue une URL du type `https://<nom-du-projet>.vercel.app` (visible sur la page du
projet, rubrique **Domains**). Aucune configuration supplémentaire n'est nécessaire pour Auth.js.

---

## 4. Vérifier

1. `https://<nom-du-projet>.vercel.app/api/health` → réponse JSON avec `"environment": "production"`.
2. Page d'accueil et catalogue : les livres du seed s'affichent.
3. Connexion avec `test@test.com` / `Test1234!` (ou la valeur de `SEED_TEST_PASSWORD`) →
   redirection vers `/tableau-de-bord`.
4. En cas d'erreur : Vercel → projet → **Logs** (les logs applicatifs sont en JSON).

---

## 5. Limites connues de la démonstration

- **Mot de passe oublié** : en production, le lien de réinitialisation n'est plus renvoyé dans
  la réponse (comportement voulu) et aucun e-mail n'est envoyé (pas de service d'e-mail
  implémenté). La fonctionnalité est donc inopérante sur la démo.
- **Démarrage à froid** : Neon (offre gratuite) met la base en veille après quelques minutes
  d'inactivité ; la première requête peut prendre quelques secondes. Si des erreurs de délai
  apparaissent, ajoutez `&connect_timeout=15` à `DATABASE_URL` sur Vercel.
- **Nouvelles migrations** : refaire l'étape 2 (`npx prisma migrate deploy` avec l'URL directe)
  **avant** de redéployer le code qui en dépend.

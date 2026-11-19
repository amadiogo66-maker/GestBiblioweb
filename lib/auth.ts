import NextAuth, { CredentialsSignin, type DefaultSession } from 'next-auth';
import { PrismaAdapter } from '@auth/prisma-adapter';
import Credentials from 'next-auth/providers/credentials';
import { compare } from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { loginSchema } from '@/schemas/auth';
import { logger } from '@/lib/logger';
import { logActivity } from '@/lib/activity-log';
import { hashIdentifier } from '@/lib/tokens';
import type { UserJWT, UserSession } from '@/types/auth';
import type { UserRole, UserStatus } from '@/types';

class AccountBlockedError extends CredentialsSignin {
  code = 'account_blocked';
}

declare module 'next-auth' {
  interface Session {
    user: UserSession & DefaultSession['user'];
  }

  interface User extends UserSession {}
}

declare module '@auth/core/jwt' {
  interface JWT {
    username: string;
    firstName: string;
    lastName: string;
    role: UserRole;
    status: UserStatus;
    photo?: string | null;
    libraryCard?: string | null;
    department?: string | null;
  }
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  adapter: PrismaAdapter(prisma),
  secret: process.env.NEXTAUTH_SECRET,
  trustHost: true,
  session: {
    strategy: 'jwt',
  },
  pages: {
    signIn: '/connexion',
    error: '/connexion',
  },
  providers: [
    Credentials({
      name: 'Credentials',
      credentials: {
        username: { label: 'Nom d’utilisateur ou email', type: 'text' },
        password: { label: 'Mot de passe', type: 'password' },
      },
      async authorize(credentials, request): Promise<UserSession | null> {
        const headers = request?.headers;

        try {
          const parsed = loginSchema.safeParse(credentials);

          if (!parsed.success) {
            return null;
          }

          const { username, password } = parsed.data;
          const normalizedIdentifier = username.trim().toLowerCase();
          const user = await prisma.user.findFirst({
            where: {
              OR: [{ username }, { email: normalizedIdentifier }],
            },
          });

          if (!user || !user.password) {
            // Compte inconnu : seul un hachage de l'identifiant est journalisé.
            await logActivity({
              action: 'auth.login.failed',
              headers,
              details: { reason: 'unknown_account', identifierHash: hashIdentifier(username) },
            });
            return null;
          }

          const isPasswordValid = await compare(password, user.password);

          if (!isPasswordValid) {
            await logActivity({
              action: 'auth.login.failed',
              userId: user.id,
              headers,
              details: { reason: 'invalid_password' },
            });
            return null;
          }

          if (user.status === 'SUSPENDED' || user.status === 'BANNED') {
            logger.warn('Blocked authentication attempt for inactive user', {
              userId: user.id,
              status: user.status,
            });
            await logActivity({ action: 'auth.login.blocked', userId: user.id, headers, details: { status: user.status } });
            throw new AccountBlockedError();
          }

          await logActivity({ action: 'auth.login.success', userId: user.id, headers });

          return {
            id: user.id,
            email: user.email,
            username: user.username,
            firstName: user.firstName,
            lastName: user.lastName,
            role: user.role,
            status: user.status,
            photo: user.photo,
            libraryCard: user.libraryCard,
            department: user.department,
          };
        } catch (error) {
          if (error instanceof AccountBlockedError) {
            throw error;
          }

          logger.error('Auth authorization failed', { error: error instanceof Error ? error.message : 'unknown error' });
          return null;
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.sub = user.id;
        token.email = user.email;
        token.username = user.username;
        token.firstName = user.firstName;
        token.lastName = user.lastName;
        token.role = user.role;
        token.status = user.status;
        token.photo = user.photo;
        token.libraryCard = user.libraryCard;
        token.department = user.department;
      }

      return token;
    },
    async session({ session, token }): Promise<typeof session> {
      if (session.user) {
        session.user.id = token.sub as string;
        session.user.email = token.email as string;
        session.user.username = token.username as string;
        session.user.firstName = token.firstName as string;
        session.user.lastName = token.lastName as string;
        session.user.role = token.role as UserRole;
        session.user.status = token.status as UserStatus;
        session.user.photo = token.photo as string | null | undefined;
        session.user.libraryCard = token.libraryCard as string | null | undefined;
        session.user.department = token.department as string | null | undefined;
      }

      return session;
    },
  },
});

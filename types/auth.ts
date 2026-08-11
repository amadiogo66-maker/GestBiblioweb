import type { UserRole, UserStatus } from '@/types';

export interface UserSession {
  id: string;
  email: string;
  username: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  status: UserStatus;
  photo?: string | null;
  libraryCard?: string | null;
  department?: string | null;
}

export interface UserJWT {
  sub: string;
  email: string;
  username: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  status: UserStatus;
  photo?: string | null;
  libraryCard?: string | null;
  department?: string | null;
}

export interface AuthCredentials {
  username: string;
  password: string;
}

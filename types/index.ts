export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
  errors?: Record<string, string[]>;
  /** Code machine facultatif (ex. 'mfa_required'). */
  code?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export {
  UserRole,
  UserStatus,
  BookStatus,
  LoanStatus,
  ReservationStatus,
  NotificationType,
  NewsCategory,
  CheckInMethod,
} from '@prisma/client';

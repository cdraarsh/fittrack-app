import '@testing-library/jest-dom/vitest';
import { vi, afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => {
  cleanup();
});

// Mock Clerk — components that import from @clerk/nextjs get no-op versions.
vi.mock('@clerk/nextjs', () => ({
  useUser: () => ({
    user: { id: 'test-user', firstName: 'Test' },
    isLoaded: true,
    isSignedIn: true,
  }),
  useAuth: () => ({ userId: 'test-user', isLoaded: true, isSignedIn: true }),
  UserButton: () => null,
  ClerkProvider: ({ children }: { children: React.ReactNode }) => children,
  SignIn: () => null,
  SignUp: () => null,
}));

// Mock Supabase client — tests that need DB behavior should override this per-test.
vi.mock('@/lib/supabase', () => {
  const chain = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
  };
  return {
    supabase: { from: vi.fn(() => chain), storage: { from: vi.fn(() => chain) } },
    getSupabase: vi.fn(() => ({ from: vi.fn(() => chain), storage: { from: vi.fn(() => chain) } })),
  };
});

'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        // CRITICAL: never retry 401s — they are auth failures, not transient errors.
        // Retrying a 401 causes the infinite loop: query → 401 → redirect → query → ...
        retry: (failureCount, error: any) => {
          if (error?.response?.status === 401) return false;
          if (error?.response?.status === 403) return false;
          if (error?.response?.status === 404) return false;
          return failureCount < 1;
        },
        staleTime: 30000,
        refetchOnWindowFocus: false,
      },
    },
  }));

  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}

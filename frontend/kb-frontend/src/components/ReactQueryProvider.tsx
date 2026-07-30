'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'

export default function ReactQueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 15_000,
        retry: (failureCount, error) =>
          !(error instanceof Error && 'status' in error &&
            [401, 403, 404].includes(Number((error as { status?: number }).status))) &&
          failureCount < 2,
        refetchOnWindowFocus: false
      },
      mutations: { retry: false }
    }
  }))

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

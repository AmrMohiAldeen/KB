'use client'

import { createContext, useContext, type ReactNode } from 'react'

const AccessTokenContext = createContext('')

type AccessTokenProviderProps = {
  accessToken: string
  children: ReactNode
}

export const AccessTokenProvider = ({ accessToken, children }: AccessTokenProviderProps) => (
  <AccessTokenContext value={accessToken}>{children}</AccessTokenContext>
)

export const useAccessToken = () => useContext(AccessTokenContext)

"use client"

import { useRef } from "react"
import { Provider } from "react-redux"
import { siteStore } from "@/store/site/store"

export function SiteStoreProvider({ children }: { children: React.ReactNode }) {
  const storeRef = useRef(siteStore)
  return <Provider store={storeRef.current}>{children}</Provider>
}

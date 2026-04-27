"use client"

import { useRef } from "react"
import { Provider } from "react-redux"
import { adminStore } from "@/store/admin/store"

export function AdminStoreProvider({ children }: { children: React.ReactNode }) {
  const storeRef = useRef(adminStore)
  return <Provider store={storeRef.current}>{children}</Provider>
}

import { configureStore } from "@reduxjs/toolkit"
import { siteApi } from "./api"

export const siteStore = configureStore({
  reducer: {
    [siteApi.reducerPath]: siteApi.reducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware().concat(siteApi.middleware),
})

export type SiteRootState = ReturnType<typeof siteStore.getState>
export type SiteAppDispatch = typeof siteStore.dispatch

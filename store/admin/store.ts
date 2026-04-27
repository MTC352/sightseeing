import { configureStore } from "@reduxjs/toolkit"
import { adminApi } from "./api"

export const adminStore = configureStore({
  reducer: {
    [adminApi.reducerPath]: adminApi.reducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware().concat(adminApi.middleware),
})

export type AdminRootState = ReturnType<typeof adminStore.getState>
export type AdminAppDispatch = typeof adminStore.dispatch

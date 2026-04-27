import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react"

export type Trip = {
  id: number
  title: string
  slug: string
  category: string
  subcategory?: string
  price: number
  duration: string
  location: string
  region?: string
  short_description?: string
  description?: string
  highlights?: string[]
  includes?: string[]
  excludes?: string[]
  images?: string[]
  featured_image?: string
  status: string
  featured: boolean
  max_participants?: number
  languages?: string[]
  difficulty?: string
  meeting_point?: string
  created_at?: string
  updated_at?: string
}

export type Post = {
  id: number
  title: string
  slug: string
  excerpt?: string
  content?: string
  author?: string
  category?: string
  tags?: string[]
  featured_image?: string
  status: string
  published_at?: string
  created_at?: string
  updated_at?: string
}

export type Job = {
  id: number
  title: string
  department?: string
  location?: string
  type?: string
  description?: string
  requirements?: string[]
  responsibilities?: string[]
  salary_range?: string
  status: string
  created_at?: string
  updated_at?: string
}

export type Application = {
  id: number
  job_id?: number
  name: string
  email: string
  phone?: string
  cover_letter?: string
  resume_url?: string
  status: string
  created_at?: string
  updated_at?: string
}

export type HelpArticle = {
  id: number
  title: string
  slug: string
  category?: string
  content?: string
  status: string
  order_index?: number
  created_at?: string
  updated_at?: string
}

export type TicketReply = {
  id: string
  ticketId: string
  body: string
  authorType: string
  authorName?: string
  createdAt?: string
}

export type Ticket = {
  id: string
  subject: string
  description?: string
  category: "bug" | "feature" | "question" | "billing" | "other"
  priority: "low" | "medium" | "high" | "urgent"
  status: "open" | "in-progress" | "waiting" | "resolved" | "closed"
  authorId?: string
  authorName?: string
  authorEmail?: string
  authorRole?: string
  assignedTo?: string
  replies: TicketReply[]
  createdAt: string
  updatedAt?: string
}

export type Departure = {
  id: string
  tripId?: string
  tripTitle: string
  tripImage?: string
  category: string
  city: string
  date: string
  time: string
  spotsTotal: number
  spotsBooked: number
  guideId?: string
  guideName: string
  status: "scheduled" | "full" | "cancelled" | "completed"
  price?: number
  notes?: string
}

export type TaxItem = {
  key: string
  label: string
  value?: string
  groupKey?: string
}

export type DashboardStats = {
  trips: number
  posts: number
  jobs: number
  tickets: number
  applications: number
  departures: number
  revenue?: number
}

export type Settings = {
  site: Record<string, unknown>
  header?: Record<string, unknown>
  footer?: Record<string, unknown>
  apiKeys?: Record<string, string>
}

export type Integration = {
  key: string
  label: string
  value: string
  updated_at?: string
}

export const adminApi = createApi({
  reducerPath: "adminApi",
  baseQuery: fetchBaseQuery({ baseUrl: "/api/admin" }),
  tagTypes: [
    "Trips",
    "Posts",
    "Jobs",
    "Applications",
    "Help",
    "Tickets",
    "Departures",
    "Taxonomies",
    "Dashboard",
    "Settings",
    "Integrations",
  ],
  endpoints: (builder) => ({
    getDashboard: builder.query<DashboardStats, void>({
      query: () => "/dashboard",
      providesTags: ["Dashboard"],
    }),

    getTrips: builder.query<Trip[], void>({
      query: () => "/trips",
      providesTags: ["Trips"],
    }),
    getTrip: builder.query<Trip, number>({
      query: (id) => `/trips/${id}`,
      providesTags: (_r, _e, id) => [{ type: "Trips", id }],
    }),
    createTrip: builder.mutation<Trip, Partial<Trip>>({
      query: (body) => ({ url: "/trips", method: "POST", body }),
      invalidatesTags: ["Trips", "Dashboard"],
    }),
    updateTrip: builder.mutation<Trip, Partial<Trip> & { id: string | number }>({
      query: ({ id, ...body }) => ({ url: `/trips/${id}`, method: "PATCH", body }),
      invalidatesTags: ["Trips", "Dashboard"],
    }),
    deleteTrip: builder.mutation<void, string | number>({
      query: (id) => ({ url: `/trips/${id}`, method: "DELETE" }),
      invalidatesTags: ["Trips", "Dashboard"],
    }),

    getPosts: builder.query<Post[], void>({
      query: () => "/posts",
      providesTags: ["Posts"],
    }),
    getPost: builder.query<Post, number>({
      query: (id) => `/posts/${id}`,
      providesTags: (_r, _e, id) => [{ type: "Posts", id }],
    }),
    createPost: builder.mutation<Post, Partial<Post>>({
      query: (body) => ({ url: "/posts", method: "POST", body }),
      invalidatesTags: ["Posts", "Dashboard"],
    }),
    updatePost: builder.mutation<Post, Partial<Post> & { id: string | number }>({
      query: ({ id, ...body }) => ({ url: `/posts/${id}`, method: "PATCH", body }),
      invalidatesTags: ["Posts", "Dashboard"],
    }),
    deletePost: builder.mutation<void, string | number>({
      query: (id) => ({ url: `/posts/${id}`, method: "DELETE" }),
      invalidatesTags: ["Posts", "Dashboard"],
    }),

    getJobs: builder.query<Job[], void>({
      query: () => "/jobs",
      providesTags: ["Jobs"],
    }),
    getJob: builder.query<Job, number>({
      query: (id) => `/jobs/${id}`,
      providesTags: (_r, _e, id) => [{ type: "Jobs", id }],
    }),
    createJob: builder.mutation<Job, Partial<Job>>({
      query: (body) => ({ url: "/jobs", method: "POST", body }),
      invalidatesTags: ["Jobs", "Dashboard"],
    }),
    updateJob: builder.mutation<Job, Partial<Job> & { id: string | number }>({
      query: ({ id, ...body }) => ({ url: `/jobs/${id}`, method: "PATCH", body }),
      invalidatesTags: ["Jobs", "Dashboard"],
    }),
    deleteJob: builder.mutation<void, string | number>({
      query: (id) => ({ url: `/jobs/${id}`, method: "DELETE" }),
      invalidatesTags: ["Jobs", "Dashboard"],
    }),

    getApplications: builder.query<Application[], void>({
      query: () => "/applications",
      providesTags: ["Applications"],
    }),
    updateApplication: builder.mutation<Application, { id: string | number; status: string }>({
      query: ({ id, ...body }) => ({ url: `/applications/${id}`, method: "PATCH", body }),
      invalidatesTags: ["Applications", "Dashboard"],
    }),

    getHelp: builder.query<HelpArticle[], void>({
      query: () => "/help",
      providesTags: ["Help"],
    }),
    getHelpArticle: builder.query<HelpArticle, number>({
      query: (id) => `/help/${id}`,
      providesTags: (_r, _e, id) => [{ type: "Help", id }],
    }),
    createHelp: builder.mutation<HelpArticle, Partial<HelpArticle>>({
      query: (body) => ({ url: "/help", method: "POST", body }),
      invalidatesTags: ["Help"],
    }),
    updateHelp: builder.mutation<HelpArticle, Partial<HelpArticle> & { id: string | number }>({
      query: ({ id, ...body }) => ({ url: `/help/${id}`, method: "PATCH", body }),
      invalidatesTags: ["Help"],
    }),
    deleteHelp: builder.mutation<void, string | number>({
      query: (id) => ({ url: `/help/${id}`, method: "DELETE" }),
      invalidatesTags: ["Help"],
    }),

    getTickets: builder.query<Ticket[], void>({
      query: () => "/tickets",
      providesTags: ["Tickets"],
    }),
    getTicket: builder.query<Ticket, number>({
      query: (id) => `/tickets/${id}`,
      providesTags: (_r, _e, id) => [{ type: "Tickets", id }],
    }),
    createTicket: builder.mutation<Ticket, Partial<Ticket>>({
      query: (body) => ({ url: "/tickets", method: "POST", body }),
      invalidatesTags: ["Tickets", "Dashboard"],
    }),
    updateTicket: builder.mutation<Ticket, { id: string | number; status?: string; priority?: string }>({
      query: ({ id, ...body }) => ({ url: `/tickets/${id}`, method: "PATCH", body }),
      invalidatesTags: ["Tickets", "Dashboard"],
    }),
    deleteTicket: builder.mutation<void, string | number>({
      query: (id) => ({ url: `/tickets/${id}`, method: "DELETE" }),
      invalidatesTags: ["Tickets", "Dashboard"],
    }),
    replyToTicket: builder.mutation<TicketReply, { id: string | number; body: string; author_name?: string }>({
      query: ({ id, ...body }) => ({ url: `/tickets/${id}/replies`, method: "POST", body }),
      invalidatesTags: ["Tickets"],
    }),

    getDepartures: builder.query<Departure[], void>({
      query: () => "/departures",
      providesTags: ["Departures"],
    }),
    createDeparture: builder.mutation<Departure, Partial<Departure>>({
      query: (body) => ({ url: "/departures", method: "POST", body }),
      invalidatesTags: ["Departures"],
    }),
    updateDeparture: builder.mutation<Departure, Partial<Departure> & { id: string }>({
      query: ({ id, ...body }) => ({ url: `/departures?id=${id}`, method: "PATCH", body }),
      invalidatesTags: ["Departures"],
    }),
    deleteDeparture: builder.mutation<void, string>({
      query: (id) => ({ url: `/departures?id=${id}`, method: "DELETE" }),
      invalidatesTags: ["Departures"],
    }),

    getTaxonomies: builder.query<TaxItem[], void>({
      query: () => "/taxonomies",
      providesTags: ["Taxonomies"],
    }),
    createTaxonomy: builder.mutation<TaxItem, Partial<TaxItem>>({
      query: (body) => ({ url: "/taxonomies", method: "POST", body }),
      invalidatesTags: ["Taxonomies"],
    }),
    saveTaxonomies: builder.mutation<void, { key: string; value: string }[]>({
      query: (body) => ({ url: "/taxonomies", method: "PATCH", body }),
      invalidatesTags: ["Taxonomies", "Trips"],
    }),
    deleteTaxonomy: builder.mutation<void, string>({
      query: (key) => ({ url: `/taxonomies/${encodeURIComponent(key)}`, method: "DELETE" }),
      invalidatesTags: ["Taxonomies"],
    }),

    getSettings: builder.query<Settings, void>({
      query: () => "/settings",
      providesTags: ["Settings"],
    }),
    updateSettings: builder.mutation<Settings, Partial<Settings>>({
      query: (body) => ({ url: "/settings", method: "POST", body }),
      invalidatesTags: ["Settings"],
    }),

    getIntegrations: builder.query<Record<string, string>, void>({
      query: () => "/integrations",
      providesTags: ["Integrations"],
    }),
    updateIntegrations: builder.mutation<void, Record<string, string>>({
      query: (body) => ({ url: "/integrations", method: "PATCH", body }),
      invalidatesTags: ["Integrations", "Settings"],
    }),
  }),
})

export const {
  useGetDashboardQuery,
  useGetTripsQuery,
  useGetTripQuery,
  useCreateTripMutation,
  useUpdateTripMutation,
  useDeleteTripMutation,
  useGetPostsQuery,
  useGetPostQuery,
  useCreatePostMutation,
  useUpdatePostMutation,
  useDeletePostMutation,
  useGetJobsQuery,
  useGetJobQuery,
  useCreateJobMutation,
  useUpdateJobMutation,
  useDeleteJobMutation,
  useGetApplicationsQuery,
  useUpdateApplicationMutation,
  useGetHelpQuery,
  useGetHelpArticleQuery,
  useCreateHelpMutation,
  useUpdateHelpMutation,
  useDeleteHelpMutation,
  useGetTicketsQuery,
  useGetTicketQuery,
  useCreateTicketMutation,
  useUpdateTicketMutation,
  useDeleteTicketMutation,
  useReplyToTicketMutation,
  useGetDeparturesQuery,
  useCreateDepartureMutation,
  useUpdateDepartureMutation,
  useDeleteDepartureMutation,
  useGetTaxonomiesQuery,
  useCreateTaxonomyMutation,
  useSaveTaxonomiesMutation,
  useDeleteTaxonomyMutation,
  useGetSettingsQuery,
  useUpdateSettingsMutation,
  useGetIntegrationsQuery,
  useUpdateIntegrationsMutation,
} = adminApi

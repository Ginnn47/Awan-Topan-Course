export const queryKeys = {
  me: ["auth", "me"] as const,
  dashboard: (date: string) => ["dashboard", date] as const,
  notifications: (date: string) => ["notifications", date] as const,
  classes: ["academics", "classes"] as const,
  teachers: ["academics", "teachers"] as const,
  subjects: ["academics", "subjects"] as const,
  rooms: ["academics", "rooms"] as const,
  enrollments: (classId: string) =>
    ["academics", "enrollments", classId] as const,
  occurrences: (from: string, to: string, filters: string) =>
    ["scheduling", from, to, filters] as const,
  session: (id: string) => ["sessions", id] as const,
  periods: ["billing", "periods"] as const,
  invoices: (period: string) => ["billing", "invoices", period] as const,
  transactions: (period: string) =>
    ["billing", "transactions", period] as const,
};

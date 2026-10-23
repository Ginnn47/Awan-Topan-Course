export type Role = "ADMIN" | "TEACHER";

export interface UserPermissions {
  manage_academics: boolean;
  manage_schedule: boolean;
  manage_finance: boolean;
  record_assigned_payments: boolean;
  execute_assigned_sessions: boolean;
}

export interface CurrentUser {
  id: string;
  email: string;
  full_name: string;
  role: Role;
  teacher_id: string | null;
  permissions: UserPermissions;
}

export interface PageMeta {
  page?: number;
  page_size?: number;
  total?: number;
  request_id?: string;
}

export interface ApiEnvelope<T> {
  data: T;
  meta: PageMeta;
}

export interface Teacher {
  id: string;
  user_id: string;
  email: string;
  full_name: string;
  teacher_code: string;
  phone: string;
  specialization: string;
  is_active: boolean;
  account_role: Role;
  assigned_classes: Array<{ id: string; name: string; level: string }>;
}

export interface Subject {
  id: string;
  name: string;
  color_key: string;
  is_active: boolean;
}

export interface Room {
  id: string;
  name: string;
  capacity: number;
  is_active: boolean;
}

export interface FeePlan {
  id: string;
  class_group: string;
  name: string;
  monthly_amount_rupiah?: number;
  is_active: boolean;
  effective_from: string;
  effective_until: string | null;
  assigned_students: number;
}

export interface ClassGroup {
  id: string;
  name: string;
  level: string;
  default_room: string | null;
  default_room_name: string;
  is_active: boolean;
  student_count: number;
  fee_plans: FeePlan[];
}

export interface Student {
  id: string;
  student_code: string;
  full_name: string;
  school: string;
  grade_level: string;
  status: string;
}

export interface Enrollment {
  id: string;
  student: string;
  student_name: string;
  student_code: string;
  student_school: string;
  class_group: string;
  class_group_name: string;
  fee_plan: string;
  fee_plan_name: string;
  monthly_amount_rupiah: number;
  started_on: string;
  ended_on: string | null;
  status: string;
}

export interface Occurrence {
  id: string;
  series: string | null;
  sequence: number;
  class_group: string;
  class_name: string;
  subject: string;
  subject_name: string;
  subject_color: string;
  teacher: string;
  teacher_name: string;
  room: string;
  room_name: string;
  start_at: string;
  end_at: string;
  status: string;
  cancellation_reason: string;
  version: number;
  student_count: number;
  session_id: string | null;
  permissions: { can_edit: boolean; can_start: boolean };
}

export interface AttendanceRow {
  id: string;
  student_id: string;
  student_name_snapshot: string;
  student_code_snapshot: string;
  status: "UNSET" | "PRESENT" | "PERMIT" | "SICK" | "ABSENT";
  note: string;
  modified_at: string;
}

export interface TeachingSession {
  id: string;
  occurrence_id: string;
  occurrence_status: string;
  class_group: string;
  class_name: string;
  subject_name: string;
  teacher_name: string;
  room_name: string;
  start_at: string;
  end_at: string;
  started_at: string;
  completed_at: string | null;
  topic: string;
  material_description: string;
  learning_notes: string;
  homework: string;
  version: number;
  student_attendance: AttendanceRow[];
  attachments: Array<{
    id: string;
    original_name: string;
    content_type: string;
    size_bytes: number;
    file?: string;
    url?: string;
    created_at?: string;
  }>;
  permissions: {
    can_edit: boolean;
    can_complete: boolean;
    can_reopen: boolean;
  };
  idempotent_replay?: boolean;
}

export interface BillingPeriod {
  id: string;
  month: string;
  due_date: string;
  status: string;
  generated_at: string;
  invoice_count: number;
}

export interface PaymentTransaction {
  id: string;
  invoice: string;
  amount_rupiah: number;
  paid_on: string;
  method: string;
  reference: string;
  note: string;
  status: "PENDING" | "VERIFIED" | "REJECTED" | "VOID";
  recorded_by_name: string;
  reviewed_by_name: string | null;
  version: number;
  proof_url: string | null;
  created_at: string;
}

export interface Invoice {
  id: string;
  period: string;
  student: string;
  student_name_snapshot: string;
  student_code_snapshot: string;
  class_group_id_snapshot: string;
  class_group_name_snapshot: string;
  fee_plan_id_snapshot: string;
  fee_plan_name_snapshot: string;
  amount_due_rupiah: number;
  verified_total_rupiah: number;
  pending_total_rupiah: number;
  outstanding_rupiah: number;
  due_date: string;
  status: "UNPAID" | "PARTIAL" | "PAID" | "OVERDUE";
  transactions: PaymentTransaction[];
  created_at: string;
}

export type ProgrammeStatus = "draft" | "published" | "archived";
export type EnrolmentStatus = "not_started" | "in_progress" | "completed";

export type TrainingCategory =
  | "onboarding"
  | "food_safety"
  | "barista"
  | "equipment"
  | "customer_service"
  | "health_safety"
  | "closing"
  | "opening"
  | "other";

export interface UserEnrolmentSummary {
  status: EnrolmentStatus;
  progress_percentage: number;
  current_step: number;
}

export interface ProgrammeSummary {
  id: string;
  title: string;
  description: string;
  category: TrainingCategory;
  cover_image: string | null;
  status: ProgrammeStatus;
  is_mandatory: boolean;
  step_count: number;
  estimated_duration_minutes: number;
  enrolment_count?: number;
  user_enrolment: UserEnrolmentSummary | null;
  created_at?: string;
}

export interface TrainingStep {
  id: string;
  programme: string;
  order: number;
  title: string;
  description: string;
  image: string | null;
  video_url: string;
  requires_acknowledgement: boolean;
  tips: string;
  created_at: string;
  updated_at: string;
  completed?: boolean;
}

export interface ProgrammeStats {
  total_enrolments: number;
  completed_count: number;
  in_progress_count: number;
  average_completion_minutes: number | null;
}

export interface ProgrammeDetail {
  id: string;
  organisation: string;
  title: string;
  description: string;
  category: TrainingCategory;
  cover_image: string | null;
  status: ProgrammeStatus;
  estimated_duration_minutes: number;
  is_mandatory: boolean;
  target_roles: string[];
  locations: string[];
  created_by: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
  step_count: number;
  steps: TrainingStep[];
  stats: ProgrammeStats;
}

export interface EnrolmentUser {
  id: string;
  name: string;
  avatar: string | null;
}

export interface Enrolment {
  id: string;
  user: EnrolmentUser;
  programme_title: string;
  status: EnrolmentStatus;
  progress_percentage: number;
  current_step: number;
  started_at: string | null;
  completed_at: string | null;
}

export interface StepCompletion {
  step_order: number;
  step_title: string;
  acknowledged: boolean;
  completed_at: string;
  notes: string;
}

export interface TrainingProgress {
  enrolment: Enrolment;
  steps: TrainingStep[];
  completions: StepCompletion[];
}

export interface TrainingComment {
  id: string;
  programme: string;
  user: string;
  user_name: string;
  body: string;
  step: string | null;
  created_at: string;
}

export interface TrainingDashboardSummary {
  fully_trained: number;
  in_progress: number;
  not_started: number;
  completion_rate: number;
  total_staff: number;
}

export type TrainingNavBadge = {
  count: number;
  tone: "red" | "amber" | "hidden";
};

export interface ProgrammeOverviewItem {
  id: string;
  title: string;
  category: TrainingCategory;
  total_staff: number;
  enrolled_count: number;
  completed_count: number;
  completion_rate: number;
}

export interface ProgrammeHistoryItem extends ProgrammeSummary {
  completed_count?: number;
  published_at: string | null;
}

export interface AssignableUser {
  id: string;
  name: string;
  avatar: string | null;
}

export interface PaginatedHistory {
  count: number;
  next: string | null;
  previous: string | null;
  results: ProgrammeHistoryItem[];
}

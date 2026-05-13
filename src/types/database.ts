export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      gyms: {
        Row: Gym;
        Insert: GymInsert;
        Update: GymUpdate;
        Relationships: [];
      };
      gym_users: {
        Row: GymUser;
        Insert: GymUserInsert;
        Update: GymUserUpdate;
        Relationships: [
          {
            foreignKeyName: "gym_users_gym_id_fkey";
            columns: ["gym_id"];
            isOneToOne: false;
            referencedRelation: "gyms";
            referencedColumns: ["id"];
          }
        ];
      };
      profiles: {
        Row: Profile;
        Insert: ProfileInsert;
        Update: ProfileUpdate;
        Relationships: [];
      };
      members: {
        Row: Member;
        Insert: MemberInsert;
        Update: MemberUpdate;
        Relationships: [
          {
            foreignKeyName: "members_gym_id_fkey";
            columns: ["gym_id"];
            isOneToOne: false;
            referencedRelation: "gyms";
            referencedColumns: ["id"];
          }
        ];
      };
      member_scores: {
        Row: MemberScore;
        Insert: MemberScoreInsert;
        Update: MemberScoreUpdate;
        Relationships: [
          {
            foreignKeyName: "member_scores_gym_id_fkey";
            columns: ["gym_id"];
            isOneToOne: false;
            referencedRelation: "gyms";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "member_scores_member_id_fkey";
            columns: ["member_id"];
            isOneToOne: true;
            referencedRelation: "members";
            referencedColumns: ["id"];
          }
        ];
      };
      ai_insights: {
        Row: AIInsight;
        Insert: AIInsightInsert;
        Update: AIInsightUpdate;
        Relationships: [
          {
            foreignKeyName: "ai_insights_gym_id_fkey";
            columns: ["gym_id"];
            isOneToOne: false;
            referencedRelation: "gyms";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ai_insights_member_id_fkey";
            columns: ["member_id"];
            isOneToOne: false;
            referencedRelation: "members";
            referencedColumns: ["id"];
          }
        ];
      };
      automations: {
        Row: Automation;
        Insert: AutomationInsert;
        Update: AutomationUpdate;
        Relationships: [
          {
            foreignKeyName: "automations_gym_id_fkey";
            columns: ["gym_id"];
            isOneToOne: false;
            referencedRelation: "gyms";
            referencedColumns: ["id"];
          }
        ];
      };
      automation_logs: {
        Row: AutomationLog;
        Insert: AutomationLogInsert;
        Update: AutomationLogUpdate;
        Relationships: [
          {
            foreignKeyName: "automation_logs_gym_id_fkey";
            columns: ["gym_id"];
            isOneToOne: false;
            referencedRelation: "gyms";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "automation_logs_automation_id_fkey";
            columns: ["automation_id"];
            isOneToOne: false;
            referencedRelation: "automations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "automation_logs_member_id_fkey";
            columns: ["member_id"];
            isOneToOne: false;
            referencedRelation: "members";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "automation_logs_insight_id_fkey";
            columns: ["insight_id"];
            isOneToOne: false;
            referencedRelation: "ai_insights";
            referencedColumns: ["id"];
          }
        ];
      };
      friend_requests: {
        Row: FriendRequest;
        Insert: FriendRequestInsert;
        Update: FriendRequestUpdate;
        Relationships: [
          {
            foreignKeyName: "friend_requests_gym_id_fkey";
            columns: ["gym_id"];
            isOneToOne: false;
            referencedRelation: "gyms";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "friend_requests_sender_member_id_fkey";
            columns: ["sender_member_id"];
            isOneToOne: false;
            referencedRelation: "members";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "friend_requests_receiver_member_id_fkey";
            columns: ["receiver_member_id"];
            isOneToOne: false;
            referencedRelation: "members";
            referencedColumns: ["id"];
          }
        ];
      };
      member_blocks: {
        Row: MemberBlock;
        Insert: MemberBlockInsert;
        Update: MemberBlockUpdate;
        Relationships: [
          {
            foreignKeyName: "member_blocks_gym_id_fkey";
            columns: ["gym_id"];
            isOneToOne: false;
            referencedRelation: "gyms";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "member_blocks_blocker_member_id_fkey";
            columns: ["blocker_member_id"];
            isOneToOne: false;
            referencedRelation: "members";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "member_blocks_blocked_member_id_fkey";
            columns: ["blocked_member_id"];
            isOneToOne: false;
            referencedRelation: "members";
            referencedColumns: ["id"];
          }
        ];
      };
      member_reports: {
        Row: MemberReport;
        Insert: MemberReportInsert;
        Update: MemberReportUpdate;
        Relationships: [
          {
            foreignKeyName: "member_reports_gym_id_fkey";
            columns: ["gym_id"];
            isOneToOne: false;
            referencedRelation: "gyms";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "member_reports_reporter_member_id_fkey";
            columns: ["reporter_member_id"];
            isOneToOne: false;
            referencedRelation: "members";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "member_reports_reported_member_id_fkey";
            columns: ["reported_member_id"];
            isOneToOne: false;
            referencedRelation: "members";
            referencedColumns: ["id"];
          }
        ];
      };
      community_posts: {
        Row: CommunityPost;
        Insert: CommunityPostInsert;
        Update: CommunityPostUpdate;
        Relationships: [
          {
            foreignKeyName: "community_posts_gym_id_fkey";
            columns: ["gym_id"];
            isOneToOne: false;
            referencedRelation: "gyms";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "community_posts_member_id_fkey";
            columns: ["member_id"];
            isOneToOne: false;
            referencedRelation: "members";
            referencedColumns: ["id"];
          }
        ];
      };
      post_likes: {
        Row: PostLike;
        Insert: PostLikeInsert;
        Update: PostLikeUpdate;
        Relationships: [
          {
            foreignKeyName: "post_likes_post_id_fkey";
            columns: ["post_id"];
            isOneToOne: false;
            referencedRelation: "community_posts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "post_likes_member_id_fkey";
            columns: ["member_id"];
            isOneToOne: false;
            referencedRelation: "members";
            referencedColumns: ["id"];
          }
        ];
      };
      post_comments: {
        Row: PostComment;
        Insert: PostCommentInsert;
        Update: PostCommentUpdate;
        Relationships: [
          {
            foreignKeyName: "post_comments_post_id_fkey";
            columns: ["post_id"];
            isOneToOne: false;
            referencedRelation: "community_posts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "post_comments_member_id_fkey";
            columns: ["member_id"];
            isOneToOne: false;
            referencedRelation: "members";
            referencedColumns: ["id"];
          }
        ];
      };
      member_push_tokens: {
        Row: MemberPushToken;
        Insert: MemberPushTokenInsert;
        Update: MemberPushTokenUpdate;
        Relationships: [
          {
            foreignKeyName: "member_push_tokens_gym_id_fkey";
            columns: ["gym_id"];
            isOneToOne: false;
            referencedRelation: "gyms";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "member_push_tokens_member_id_fkey";
            columns: ["member_id"];
            isOneToOne: false;
            referencedRelation: "members";
            referencedColumns: ["id"];
          }
        ];
      };
      notifications: {
        Row: Notification;
        Insert: NotificationInsert;
        Update: NotificationUpdate;
        Relationships: [
          {
            foreignKeyName: "notifications_gym_id_fkey";
            columns: ["gym_id"];
            isOneToOne: false;
            referencedRelation: "gyms";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "notifications_member_id_fkey";
            columns: ["member_id"];
            isOneToOne: false;
            referencedRelation: "members";
            referencedColumns: ["id"];
          }
        ];
      };
      membership_plans: {
        Row: MembershipPlan;
        Insert: MembershipPlanInsert;
        Update: MembershipPlanUpdate;
        Relationships: [
          {
            foreignKeyName: "membership_plans_gym_id_fkey";
            columns: ["gym_id"];
            isOneToOne: false;
            referencedRelation: "gyms";
            referencedColumns: ["id"];
          }
        ];
      };
      subscriptions: {
        Row: Subscription;
        Insert: SubscriptionInsert;
        Update: SubscriptionUpdate;
        Relationships: [
          {
            foreignKeyName: "subscriptions_gym_id_fkey";
            columns: ["gym_id"];
            isOneToOne: false;
            referencedRelation: "gyms";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "subscriptions_member_id_fkey";
            columns: ["member_id"];
            isOneToOne: false;
            referencedRelation: "members";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "subscriptions_membership_plan_id_fkey";
            columns: ["membership_plan_id"];
            isOneToOne: false;
            referencedRelation: "membership_plans";
            referencedColumns: ["id"];
          }
        ];
      };
      payments: {
        Row: Payment;
        Insert: PaymentInsert;
        Update: PaymentUpdate;
        Relationships: [
          {
            foreignKeyName: "payments_gym_id_fkey";
            columns: ["gym_id"];
            isOneToOne: false;
            referencedRelation: "gyms";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "payments_member_id_fkey";
            columns: ["member_id"];
            isOneToOne: false;
            referencedRelation: "members";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "payments_subscription_id_fkey";
            columns: ["subscription_id"];
            isOneToOne: false;
            referencedRelation: "subscriptions";
            referencedColumns: ["id"];
          }
        ];
      };
      stripe_webhook_events: {
        Row: StripeWebhookEvent;
        Insert: StripeWebhookEventInsert;
        Update: StripeWebhookEventUpdate;
        Relationships: [];
      };
      check_ins: {
        Row: CheckIn;
        Insert: CheckInInsert;
        Update: CheckInUpdate;
        Relationships: [
          {
            foreignKeyName: "check_ins_gym_id_fkey";
            columns: ["gym_id"];
            isOneToOne: false;
            referencedRelation: "gyms";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "check_ins_member_id_fkey";
            columns: ["member_id"];
            isOneToOne: false;
            referencedRelation: "members";
            referencedColumns: ["id"];
          }
        ];
      };
      workouts: {
        Row: Workout;
        Insert: WorkoutInsert;
        Update: WorkoutUpdate;
        Relationships: [
          {
            foreignKeyName: "workouts_gym_id_fkey";
            columns: ["gym_id"];
            isOneToOne: false;
            referencedRelation: "gyms";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "workouts_member_id_fkey";
            columns: ["member_id"];
            isOneToOne: false;
            referencedRelation: "members";
            referencedColumns: ["id"];
          }
        ];
      };
      workout_sets: {
        Row: WorkoutSet;
        Insert: WorkoutSetInsert;
        Update: WorkoutSetUpdate;
        Relationships: [
          {
            foreignKeyName: "workout_sets_workout_id_fkey";
            columns: ["workout_id"];
            isOneToOne: false;
            referencedRelation: "workouts";
            referencedColumns: ["id"];
          }
        ];
      };
    };
    Views: Record<string, never>;
    Functions: {
      create_gym_with_owner_membership: {
        Args: {
          gym_name: string;
          gym_slug: string;
        };
        Returns: {
          gym_id: string;
        }[];
      };
      claim_member_profile: {
        Args: Record<string, never>;
        Returns: string | null;
      };
      create_member_workout: {
        Args: {
          workout_title: string;
          workout_notes: string | null;
          workout_performed_at: string | null;
          workout_sets_payload: Json;
        };
        Returns: string;
      };
      register_member_push_token: {
        Args: {
          token_value: string;
          token_platform?: string;
        };
        Returns: string;
      };
      search_gym_members: {
        Args: {
          search_query?: string;
        };
        Returns: {
          id: string;
          first_name: string;
          last_name: string;
          email: string;
        }[];
      };
      create_friend_request: {
        Args: {
          target_member_id: string;
        };
        Returns: string;
      };
      accept_friend_request: {
        Args: {
          request_id: string;
        };
        Returns: string;
      };
      create_community_post: {
        Args: {
          post_body: string | null;
          post_image_url: string | null;
          post_visibility?: string | null;
        };
        Returns: string;
      };
      react_to_post: {
        Args: {
          target_post_id: string;
          reaction_value: string;
        };
        Returns: string;
      };
      create_post_comment: {
        Args: {
          target_post_id: string;
          comment_body: string;
        };
        Returns: string;
      };
      block_member: {
        Args: {
          target_member_id: string;
        };
        Returns: string;
      };
      report_member: {
        Args: {
          target_member_id: string;
          report_reason: string;
        };
        Returns: string;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

export interface Gym {
  id: string;
  name: string;
  slug: string;
  owner_user_id: string | null;
  timezone: string;
  stripe_connected_account_id: string | null;
  stripe_onboarding_completed: boolean;
  stripe_charges_enabled: boolean;
  stripe_payouts_enabled: boolean;
  stripe_details_submitted: boolean;
  created_at: string;
  updated_at: string;
}

export interface GymInsert {
  id?: string;
  name: string;
  slug: string;
  owner_user_id?: string | null;
  timezone?: string;
  stripe_connected_account_id?: string | null;
  stripe_onboarding_completed?: boolean;
  stripe_charges_enabled?: boolean;
  stripe_payouts_enabled?: boolean;
  stripe_details_submitted?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface GymUpdate {
  id?: string;
  name?: string;
  slug?: string;
  owner_user_id?: string | null;
  timezone?: string;
  stripe_connected_account_id?: string | null;
  stripe_onboarding_completed?: boolean;
  stripe_charges_enabled?: boolean;
  stripe_payouts_enabled?: boolean;
  stripe_details_submitted?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface GymUser {
  id: string;
  gym_id: string;
  user_id: string;
  role: "owner" | "manager" | "coach" | "staff";
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface GymUserInsert {
  id?: string;
  gym_id: string;
  user_id: string;
  role?: "owner" | "manager" | "coach" | "staff";
  is_active?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface GymUserUpdate {
  id?: string;
  gym_id?: string;
  user_id?: string;
  role?: "owner" | "manager" | "coach" | "staff";
  is_active?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface Member {
  id: string;
  gym_id: string;
  user_id: string | null;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  stripe_customer_id: string | null;
  status: "active" | "frozen" | "canceled" | "lead";
  joined_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface MemberInsert {
  id?: string;
  gym_id: string;
  user_id?: string | null;
  first_name: string;
  last_name: string;
  email?: string | null;
  phone?: string | null;
  stripe_customer_id?: string | null;
  status?: "active" | "frozen" | "canceled" | "lead";
  joined_at?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface MemberUpdate {
  id?: string;
  gym_id?: string;
  user_id?: string | null;
  first_name?: string;
  last_name?: string;
  email?: string | null;
  phone?: string | null;
  stripe_customer_id?: string | null;
  status?: "active" | "frozen" | "canceled" | "lead";
  joined_at?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface CheckIn {
  id: string;
  gym_id: string;
  member_id: string;
  check_in_method: "manual" | "qr";
  created_at: string;
}

export interface CheckInInsert {
  id?: string;
  gym_id: string;
  member_id: string;
  check_in_method?: "manual" | "qr";
  created_at?: string;
}

export interface CheckInUpdate {
  id?: string;
  gym_id?: string;
  member_id?: string;
  check_in_method?: "manual" | "qr";
  created_at?: string;
}

export interface Workout {
  id: string;
  gym_id: string;
  member_id: string;
  title: string;
  notes: string | null;
  performed_at: string;
  created_at: string;
}

export interface WorkoutInsert {
  id?: string;
  gym_id: string;
  member_id: string;
  title: string;
  notes?: string | null;
  performed_at?: string;
  created_at?: string;
}

export interface WorkoutUpdate {
  id?: string;
  gym_id?: string;
  member_id?: string;
  title?: string;
  notes?: string | null;
  performed_at?: string;
  created_at?: string;
}

export interface WorkoutSet {
  id: string;
  workout_id: string;
  exercise_name: string;
  set_index: number;
  reps: number;
  weight: number;
  created_at: string;
}

export interface WorkoutSetInsert {
  id?: string;
  workout_id: string;
  exercise_name: string;
  set_index: number;
  reps: number;
  weight?: number;
  created_at?: string;
}

export interface WorkoutSetUpdate {
  id?: string;
  workout_id?: string;
  exercise_name?: string;
  set_index?: number;
  reps?: number;
  weight?: number;
  created_at?: string;
}

export interface MemberScore {
  gym_id: string;
  member_id: string;
  engagement_score: number;
  retention_risk_score: number;
  last_calculated_at: string;
}

export interface MemberScoreInsert {
  gym_id: string;
  member_id: string;
  engagement_score: number;
  retention_risk_score: number;
  last_calculated_at?: string;
}

export interface MemberScoreUpdate {
  gym_id?: string;
  member_id?: string;
  engagement_score?: number;
  retention_risk_score?: number;
  last_calculated_at?: string;
}

export interface AIInsight {
  id: string;
  gym_id: string;
  member_id: string | null;
  type:
    | "retention_risk"
    | "inactivity"
    | "attendance_drop"
    | "failed_payment"
    | "missing_subscription"
    | "revenue_leak"
    | "upsell_opportunity";
  title: string;
  description: string;
  priority: "low" | "medium" | "high";
  status: "open" | "dismissed";
  created_at: string;
}

export interface AIInsightInsert {
  id?: string;
  gym_id: string;
  member_id?: string | null;
  type:
    | "retention_risk"
    | "inactivity"
    | "attendance_drop"
    | "failed_payment"
    | "missing_subscription"
    | "revenue_leak"
    | "upsell_opportunity";
  title: string;
  description: string;
  priority: "low" | "medium" | "high";
  status?: "open" | "dismissed";
  created_at?: string;
}

export interface AIInsightUpdate {
  id?: string;
  gym_id?: string;
  member_id?: string | null;
  type?:
    | "retention_risk"
    | "inactivity"
    | "attendance_drop"
    | "failed_payment"
    | "missing_subscription"
    | "revenue_leak"
    | "upsell_opportunity";
  title?: string;
  description?: string;
  priority?: "low" | "medium" | "high";
  status?: "open" | "dismissed";
  created_at?: string;
}

export interface Automation {
  id: string;
  gym_id: string;
  name: string;
  trigger_type: "insight_created" | "member_inactive" | "payment_failed";
  insight_type:
    | "retention_risk"
    | "inactivity"
    | "attendance_drop"
    | "failed_payment"
    | "missing_subscription"
    | "revenue_leak"
    | "upsell_opportunity"
    | null;
  action_type: "create_insight" | "log_action";
  is_active: boolean;
  created_at: string;
}

export interface AutomationInsert {
  id?: string;
  gym_id: string;
  name: string;
  trigger_type: "insight_created" | "member_inactive" | "payment_failed";
  insight_type?:
    | "retention_risk"
    | "inactivity"
    | "attendance_drop"
    | "failed_payment"
    | "missing_subscription"
    | "revenue_leak"
    | "upsell_opportunity"
    | null;
  action_type: "create_insight" | "log_action";
  is_active?: boolean;
  created_at?: string;
}

export interface AutomationUpdate {
  id?: string;
  gym_id?: string;
  name?: string;
  trigger_type?: "insight_created" | "member_inactive" | "payment_failed";
  insight_type?:
    | "retention_risk"
    | "inactivity"
    | "attendance_drop"
    | "failed_payment"
    | "missing_subscription"
    | "revenue_leak"
    | "upsell_opportunity"
    | null;
  action_type?: "create_insight" | "log_action";
  is_active?: boolean;
  created_at?: string;
}

export interface AutomationLog {
  id: string;
  gym_id: string;
  automation_id: string;
  member_id: string | null;
  insight_id: string | null;
  result: "success" | "skipped";
  message: string;
  created_at: string;
}

export interface AutomationLogInsert {
  id?: string;
  gym_id: string;
  automation_id: string;
  member_id?: string | null;
  insight_id?: string | null;
  result: "success" | "skipped";
  message: string;
  created_at?: string;
}

export interface AutomationLogUpdate {
  id?: string;
  gym_id?: string;
  automation_id?: string;
  member_id?: string | null;
  insight_id?: string | null;
  result?: "success" | "skipped";
  message?: string;
  created_at?: string;
}

export interface FriendRequest {
  id: string;
  gym_id: string;
  sender_member_id: string;
  receiver_member_id: string;
  status: "pending" | "accepted" | "declined";
  created_at: string;
  updated_at: string;
}

export interface FriendRequestInsert {
  id?: string;
  gym_id: string;
  sender_member_id: string;
  receiver_member_id: string;
  status?: "pending" | "accepted" | "declined";
  created_at?: string;
  updated_at?: string;
}

export interface FriendRequestUpdate {
  id?: string;
  gym_id?: string;
  sender_member_id?: string;
  receiver_member_id?: string;
  status?: "pending" | "accepted" | "declined";
  created_at?: string;
  updated_at?: string;
}

export interface MemberBlock {
  id: string;
  gym_id: string;
  blocker_member_id: string;
  blocked_member_id: string;
  created_at: string;
}

export interface MemberBlockInsert {
  id?: string;
  gym_id: string;
  blocker_member_id: string;
  blocked_member_id: string;
  created_at?: string;
}

export interface MemberBlockUpdate {
  id?: string;
  gym_id?: string;
  blocker_member_id?: string;
  blocked_member_id?: string;
  created_at?: string;
}

export interface MemberReport {
  id: string;
  gym_id: string;
  reporter_member_id: string;
  reported_member_id: string;
  reason: string;
  created_at: string;
}

export interface MemberReportInsert {
  id?: string;
  gym_id: string;
  reporter_member_id: string;
  reported_member_id: string;
  reason: string;
  created_at?: string;
}

export interface MemberReportUpdate {
  id?: string;
  gym_id?: string;
  reporter_member_id?: string;
  reported_member_id?: string;
  reason?: string;
  created_at?: string;
}

export interface CommunityPost {
  id: string;
  gym_id: string;
  member_id: string;
  body: string | null;
  image_url: string | null;
  visibility: "friends_only" | "gym_feed";
  is_auto_generated: boolean;
  metadata: Json;
  created_at: string;
}

export interface CommunityPostInsert {
  id?: string;
  gym_id: string;
  member_id: string;
  body?: string | null;
  image_url?: string | null;
  visibility?: "friends_only" | "gym_feed";
  is_auto_generated?: boolean;
  metadata?: Json;
  created_at?: string;
}

export interface CommunityPostUpdate {
  id?: string;
  gym_id?: string;
  member_id?: string;
  body?: string | null;
  image_url?: string | null;
  visibility?: "friends_only" | "gym_feed";
  is_auto_generated?: boolean;
  metadata?: Json;
  created_at?: string;
}

export interface PostLike {
  id: string;
  post_id: string;
  member_id: string;
  reaction: "🔥" | "💪" | "👏";
  created_at: string;
}

export interface PostLikeInsert {
  id?: string;
  post_id: string;
  member_id: string;
  reaction?: "🔥" | "💪" | "👏";
  created_at?: string;
}

export interface PostLikeUpdate {
  id?: string;
  post_id?: string;
  member_id?: string;
  reaction?: "🔥" | "💪" | "👏";
  created_at?: string;
}

export interface PostComment {
  id: string;
  post_id: string;
  member_id: string;
  body: string;
  created_at: string;
}

export interface PostCommentInsert {
  id?: string;
  post_id: string;
  member_id: string;
  body: string;
  created_at?: string;
}

export interface PostCommentUpdate {
  id?: string;
  post_id?: string;
  member_id?: string;
  body?: string;
  created_at?: string;
}

export interface MemberPushToken {
  id: string;
  gym_id: string;
  member_id: string;
  push_token: string;
  platform: "expo" | "fcm";
  created_at: string;
  updated_at: string;
}

export interface MemberPushTokenInsert {
  id?: string;
  gym_id: string;
  member_id: string;
  push_token: string;
  platform?: "expo" | "fcm";
  created_at?: string;
  updated_at?: string;
}

export interface MemberPushTokenUpdate {
  id?: string;
  gym_id?: string;
  member_id?: string;
  push_token?: string;
  platform?: "expo" | "fcm";
  created_at?: string;
  updated_at?: string;
}

export interface Notification {
  id: string;
  gym_id: string;
  member_id: string;
  title: string;
  body: string;
  type: "retention" | "workout" | "billing" | "general";
  status: "pending" | "sent" | "failed";
  created_at: string;
}

export interface NotificationInsert {
  id?: string;
  gym_id: string;
  member_id: string;
  title: string;
  body: string;
  type: "retention" | "workout" | "billing" | "general";
  status?: "pending" | "sent" | "failed";
  created_at?: string;
}

export interface NotificationUpdate {
  id?: string;
  gym_id?: string;
  member_id?: string;
  title?: string;
  body?: string;
  type?: "retention" | "workout" | "billing" | "general";
  status?: "pending" | "sent" | "failed";
  created_at?: string;
}

export interface MembershipPlan {
  id: string;
  gym_id: string;
  name: string;
  price_cents: number;
  billing_interval: "monthly" | "weekly";
  is_active: boolean;
  archived_at: string | null;
  stripe_product_id: string | null;
  stripe_price_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface MembershipPlanInsert {
  id?: string;
  gym_id: string;
  name: string;
  price_cents: number;
  billing_interval?: "monthly" | "weekly";
  is_active?: boolean;
  archived_at?: string | null;
  stripe_product_id?: string | null;
  stripe_price_id?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface MembershipPlanUpdate {
  id?: string;
  gym_id?: string;
  name?: string;
  price_cents?: number;
  billing_interval?: "monthly" | "weekly";
  is_active?: boolean;
  archived_at?: string | null;
  stripe_product_id?: string | null;
  stripe_price_id?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface Subscription {
  id: string;
  gym_id: string;
  member_id: string;
  membership_plan_id: string | null;
  status: "active" | "past_due" | "canceled" | "trialing";
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  stripe_subscription_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface SubscriptionInsert {
  id?: string;
  gym_id: string;
  member_id: string;
  membership_plan_id?: string | null;
  status?: "active" | "past_due" | "canceled" | "trialing";
  current_period_start?: string | null;
  current_period_end?: string | null;
  cancel_at_period_end?: boolean;
  stripe_subscription_id?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface SubscriptionUpdate {
  id?: string;
  gym_id?: string;
  member_id?: string;
  membership_plan_id?: string | null;
  status?: "active" | "past_due" | "canceled" | "trialing";
  current_period_start?: string | null;
  current_period_end?: string | null;
  cancel_at_period_end?: boolean;
  stripe_subscription_id?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface Payment {
  id: string;
  gym_id: string;
  member_id: string | null;
  subscription_id: string | null;
  amount_cents: number;
  status: "succeeded" | "failed" | "pending";
  paid_at: string | null;
  stripe_payment_intent_id: string | null;
  stripe_invoice_id: string | null;
  created_at: string;
}

export interface PaymentInsert {
  id?: string;
  gym_id: string;
  member_id?: string | null;
  subscription_id?: string | null;
  amount_cents: number;
  status?: "succeeded" | "failed" | "pending";
  paid_at?: string | null;
  stripe_payment_intent_id?: string | null;
  stripe_invoice_id?: string | null;
  created_at?: string;
}

export interface PaymentUpdate {
  id?: string;
  gym_id?: string;
  member_id?: string | null;
  subscription_id?: string | null;
  amount_cents?: number;
  status?: "succeeded" | "failed" | "pending";
  paid_at?: string | null;
  stripe_payment_intent_id?: string | null;
  stripe_invoice_id?: string | null;
  created_at?: string;
}

export interface StripeWebhookEvent {
  id: string;
  stripe_event_id: string;
  event_type: string;
  processed_at: string | null;
  created_at: string;
}

export interface StripeWebhookEventInsert {
  id?: string;
  stripe_event_id: string;
  event_type: string;
  processed_at?: string | null;
  created_at?: string;
}

export interface StripeWebhookEventUpdate {
  id?: string;
  stripe_event_id?: string;
  event_type?: string;
  processed_at?: string | null;
  created_at?: string;
}

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  gym_name: string | null;
  role: "owner" | "manager" | "coach" | "staff";
  created_at: string;
  updated_at: string;
}

export interface ProfileInsert {
  id: string;
  email: string;
  full_name?: string | null;
  gym_name?: string | null;
  role?: "owner" | "manager" | "coach" | "staff";
  created_at?: string;
  updated_at?: string;
}

export interface ProfileUpdate {
  id?: string;
  email?: string;
  full_name?: string | null;
  gym_name?: string | null;
  role?: "owner" | "manager" | "coach" | "staff";
  created_at?: string;
  updated_at?: string;
}

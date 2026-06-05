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
      gym_challenges: {
        Row: GymChallenge;
        Insert: GymChallengeInsert;
        Update: GymChallengeUpdate;
        Relationships: [
          {
            foreignKeyName: "gym_challenges_gym_id_fkey";
            columns: ["gym_id"];
            isOneToOne: false;
            referencedRelation: "gyms";
            referencedColumns: ["id"];
          }
        ];
      };
      gym_announcements: {
        Row: GymAnnouncement;
        Insert: GymAnnouncementInsert;
        Update: GymAnnouncementUpdate;
        Relationships: [
          {
            foreignKeyName: "gym_announcements_gym_id_fkey";
            columns: ["gym_id"];
            isOneToOne: false;
            referencedRelation: "gyms";
            referencedColumns: ["id"];
          }
        ];
      };
      gym_member_spotlights: {
        Row: GymMemberSpotlight;
        Insert: GymMemberSpotlightInsert;
        Update: GymMemberSpotlightUpdate;
        Relationships: [
          {
            foreignKeyName: "gym_member_spotlights_created_by_user_id_fkey";
            columns: ["created_by_user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "gym_member_spotlights_gym_id_fkey";
            columns: ["gym_id"];
            isOneToOne: false;
            referencedRelation: "gyms";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "gym_member_spotlights_member_id_fkey";
            columns: ["member_id"];
            isOneToOne: false;
            referencedRelation: "members";
            referencedColumns: ["id"];
          }
        ];
      };
      gym_shoutouts: {
        Row: GymShoutout;
        Insert: GymShoutoutInsert;
        Update: GymShoutoutUpdate;
        Relationships: [
          {
            foreignKeyName: "gym_shoutouts_created_by_user_id_fkey";
            columns: ["created_by_user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "gym_shoutouts_gym_id_fkey";
            columns: ["gym_id"];
            isOneToOne: false;
            referencedRelation: "gyms";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "gym_shoutouts_member_id_fkey";
            columns: ["member_id"];
            isOneToOne: false;
            referencedRelation: "members";
            referencedColumns: ["id"];
          }
        ];
      };
      fridge_products: {
        Row: FridgeProduct;
        Insert: FridgeProductInsert;
        Update: FridgeProductUpdate;
        Relationships: [
          {
            foreignKeyName: "fridge_products_gym_id_fkey";
            columns: ["gym_id"];
            isOneToOne: false;
            referencedRelation: "gyms";
            referencedColumns: ["id"];
          }
        ];
      };
      fridge_unlock_sessions: {
        Row: FridgeUnlockSession;
        Insert: FridgeUnlockSessionInsert;
        Update: FridgeUnlockSessionUpdate;
        Relationships: [
          {
            foreignKeyName: "fridge_unlock_sessions_gym_id_fkey";
            columns: ["gym_id"];
            isOneToOne: false;
            referencedRelation: "gyms";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "fridge_unlock_sessions_member_id_fkey";
            columns: ["member_id"];
            isOneToOne: false;
            referencedRelation: "members";
            referencedColumns: ["id"];
          }
        ];
      };
      fridge_access_events: {
        Row: FridgeAccessEvent;
        Insert: FridgeAccessEventInsert;
        Update: FridgeAccessEventUpdate;
        Relationships: [
          {
            foreignKeyName: "fridge_access_events_gym_id_fkey";
            columns: ["gym_id"];
            isOneToOne: false;
            referencedRelation: "gyms";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "fridge_access_events_member_id_fkey";
            columns: ["member_id"];
            isOneToOne: false;
            referencedRelation: "members";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "fridge_access_events_fridge_unlock_session_id_fkey";
            columns: ["fridge_unlock_session_id"];
            isOneToOne: false;
            referencedRelation: "fridge_unlock_sessions";
            referencedColumns: ["id"];
          }
        ];
      };
      fridge_orders: {
        Row: FridgeOrder;
        Insert: FridgeOrderInsert;
        Update: FridgeOrderUpdate;
        Relationships: [
          {
            foreignKeyName: "fridge_orders_gym_id_fkey";
            columns: ["gym_id"];
            isOneToOne: false;
            referencedRelation: "gyms";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "fridge_orders_member_id_fkey";
            columns: ["member_id"];
            isOneToOne: false;
            referencedRelation: "members";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "fridge_orders_fridge_unlock_session_id_fkey";
            columns: ["fridge_unlock_session_id"];
            isOneToOne: true;
            referencedRelation: "fridge_unlock_sessions";
            referencedColumns: ["id"];
          }
        ];
      };
      fridge_order_items: {
        Row: FridgeOrderItem;
        Insert: FridgeOrderItemInsert;
        Update: FridgeOrderItemUpdate;
        Relationships: [
          {
            foreignKeyName: "fridge_order_items_fridge_order_id_fkey";
            columns: ["fridge_order_id"];
            isOneToOne: false;
            referencedRelation: "fridge_orders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "fridge_order_items_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "fridge_products";
            referencedColumns: ["id"];
          }
        ];
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
      member_membership_events: {
        Row: MemberMembershipEvent;
        Insert: MemberMembershipEventInsert;
        Update: MemberMembershipEventUpdate;
        Relationships: [
          {
            foreignKeyName: "member_membership_events_gym_id_fkey";
            columns: ["gym_id"];
            isOneToOne: false;
            referencedRelation: "gyms";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "member_membership_events_member_id_fkey";
            columns: ["member_id"];
            isOneToOne: false;
            referencedRelation: "members";
            referencedColumns: ["id"];
          }
        ];
      };
      member_freeze_reminders: {
        Row: MemberFreezeReminder;
        Insert: MemberFreezeReminderInsert;
        Update: MemberFreezeReminderUpdate;
        Relationships: [
          {
            foreignKeyName: "member_freeze_reminders_gym_id_fkey";
            columns: ["gym_id"];
            isOneToOne: false;
            referencedRelation: "gyms";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "member_freeze_reminders_member_id_fkey";
            columns: ["member_id"];
            isOneToOne: false;
            referencedRelation: "members";
            referencedColumns: ["id"];
          }
        ];
      };
      member_follow_up_tasks: {
        Row: MemberFollowUpTask;
        Insert: MemberFollowUpTaskInsert;
        Update: MemberFollowUpTaskUpdate;
        Relationships: [
          {
            foreignKeyName: "member_follow_up_tasks_author_user_id_fkey";
            columns: ["author_user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "member_follow_up_tasks_gym_id_fkey";
            columns: ["gym_id"];
            isOneToOne: false;
            referencedRelation: "gyms";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "member_follow_up_tasks_member_id_fkey";
            columns: ["member_id"];
            isOneToOne: false;
            referencedRelation: "members";
            referencedColumns: ["id"];
          }
        ];
      };
      member_notes: {
        Row: MemberNote;
        Insert: MemberNoteInsert;
        Update: MemberNoteUpdate;
        Relationships: [
          {
            foreignKeyName: "member_notes_author_user_id_fkey";
            columns: ["author_user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "member_notes_gym_id_fkey";
            columns: ["gym_id"];
            isOneToOne: false;
            referencedRelation: "gyms";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "member_notes_member_id_fkey";
            columns: ["member_id"];
            isOneToOne: false;
            referencedRelation: "members";
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
      billing_retry_policies: {
        Row: BillingRetryPolicy;
        Insert: BillingRetryPolicyInsert;
        Update: BillingRetryPolicyUpdate;
        Relationships: [
          {
            foreignKeyName: "billing_retry_policies_gym_id_fkey";
            columns: ["gym_id"];
            isOneToOne: true;
            referencedRelation: "gyms";
            referencedColumns: ["id"];
          }
        ];
      };
      billing_recovery_cases: {
        Row: BillingRecoveryCase;
        Insert: BillingRecoveryCaseInsert;
        Update: BillingRecoveryCaseUpdate;
        Relationships: [
          {
            foreignKeyName: "billing_recovery_cases_gym_id_fkey";
            columns: ["gym_id"];
            isOneToOne: false;
            referencedRelation: "gyms";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "billing_recovery_cases_member_id_fkey";
            columns: ["member_id"];
            isOneToOne: false;
            referencedRelation: "members";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "billing_recovery_cases_subscription_id_fkey";
            columns: ["subscription_id"];
            isOneToOne: false;
            referencedRelation: "subscriptions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "billing_recovery_cases_payment_id_fkey";
            columns: ["payment_id"];
            isOneToOne: false;
            referencedRelation: "payments";
            referencedColumns: ["id"];
          }
        ];
      };
      billing_recovery_attempts: {
        Row: BillingRecoveryAttempt;
        Insert: BillingRecoveryAttemptInsert;
        Update: BillingRecoveryAttemptUpdate;
        Relationships: [
          {
            foreignKeyName: "billing_recovery_attempts_gym_id_fkey";
            columns: ["gym_id"];
            isOneToOne: false;
            referencedRelation: "gyms";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "billing_recovery_attempts_case_id_fkey";
            columns: ["case_id"];
            isOneToOne: false;
            referencedRelation: "billing_recovery_cases";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "billing_recovery_attempts_payment_id_fkey";
            columns: ["payment_id"];
            isOneToOne: false;
            referencedRelation: "payments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "billing_recovery_attempts_member_id_fkey";
            columns: ["member_id"];
            isOneToOne: false;
            referencedRelation: "members";
            referencedColumns: ["id"];
          }
        ];
      };
      billing_daily_reports: {
        Row: BillingDailyReport;
        Insert: BillingDailyReportInsert;
        Update: BillingDailyReportUpdate;
        Relationships: [
          {
            foreignKeyName: "billing_daily_reports_gym_id_fkey";
            columns: ["gym_id"];
            isOneToOne: false;
            referencedRelation: "gyms";
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
          },
          {
            foreignKeyName: "check_ins_schedule_session_id_fkey";
            columns: ["schedule_session_id"];
            isOneToOne: false;
            referencedRelation: "schedule_sessions";
            referencedColumns: ["id"];
          }
        ];
      };
      schedule_programs: {
        Row: ScheduleProgram;
        Insert: ScheduleProgramInsert;
        Update: ScheduleProgramUpdate;
        Relationships: [
          {
            foreignKeyName: "schedule_programs_gym_id_fkey";
            columns: ["gym_id"];
            isOneToOne: false;
            referencedRelation: "gyms";
            referencedColumns: ["id"];
          }
        ];
      };
      schedule_sessions: {
        Row: ScheduleSession;
        Insert: ScheduleSessionInsert;
        Update: ScheduleSessionUpdate;
        Relationships: [
          {
            foreignKeyName: "schedule_sessions_gym_id_fkey";
            columns: ["gym_id"];
            isOneToOne: false;
            referencedRelation: "gyms";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "schedule_sessions_program_id_fkey";
            columns: ["program_id"];
            isOneToOne: false;
            referencedRelation: "schedule_programs";
            referencedColumns: ["id"];
          }
        ];
      };
      schedule_bookings: {
        Row: ScheduleBooking;
        Insert: ScheduleBookingInsert;
        Update: ScheduleBookingUpdate;
        Relationships: [
          {
            foreignKeyName: "schedule_bookings_gym_id_fkey";
            columns: ["gym_id"];
            isOneToOne: false;
            referencedRelation: "gyms";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "schedule_bookings_session_id_fkey";
            columns: ["session_id"];
            isOneToOne: false;
            referencedRelation: "schedule_sessions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "schedule_bookings_member_id_fkey";
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
      create_member_fridge_unlock_session: {
        Args: {
          selected_items_payload: Json;
          expires_in_seconds?: number;
        };
        Returns: {
          id: string;
          gym_id: string;
          member_id: string;
          selected_items: Json;
          estimated_total_cents: number;
          status: string;
          qr_token: string;
          expires_at: string;
          created_at: string;
        }[];
      };
      create_schedule_booking_for_member: {
        Args: {
          target_session_id: string;
          target_member_id: string;
          booking_source?: string;
        };
        Returns: ScheduleBooking;
      };
      cancel_schedule_booking_for_member: {
        Args: {
          target_booking_id: string;
          target_member_id: string;
        };
        Returns: ScheduleBooking;
      };
      get_member_billing_summary: {
        Args: Record<string, never>;
        Returns: {
          membership_status: string;
          billing_cycle: string | null;
          membership_plan_name: string | null;
          current_period_start: string | null;
          current_period_end: string | null;
          has_card_on_file: boolean;
          card_brand: string | null;
          card_last4: string | null;
          frozen_until: string | null;
        }[];
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
  default_waiver_title: string | null;
  default_waiver_body: string | null;
  require_waiver_on_signup: boolean;
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
  default_waiver_title?: string | null;
  default_waiver_body?: string | null;
  require_waiver_on_signup?: boolean;
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
  default_waiver_title?: string | null;
  default_waiver_body?: string | null;
  require_waiver_on_signup?: boolean;
  stripe_connected_account_id?: string | null;
  stripe_onboarding_completed?: boolean;
  stripe_charges_enabled?: boolean;
  stripe_payouts_enabled?: boolean;
  stripe_details_submitted?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface GymChallenge {
  id: string;
  gym_id: string;
  title: string;
  description: string | null;
  metric_type: "steps" | "visits" | "workouts";
  goal_value: number;
  period: "weekly" | "monthly";
  starts_on: string;
  ends_on: string;
  status: "active" | "archived";
  created_at: string;
  updated_at: string;
}

export interface GymChallengeInsert {
  id?: string;
  gym_id: string;
  title: string;
  description?: string | null;
  metric_type: "steps" | "visits" | "workouts";
  goal_value: number;
  period: "weekly" | "monthly";
  starts_on: string;
  ends_on: string;
  status?: "active" | "archived";
  created_at?: string;
  updated_at?: string;
}

export interface GymChallengeUpdate {
  id?: string;
  gym_id?: string;
  title?: string;
  description?: string | null;
  metric_type?: "steps" | "visits" | "workouts";
  goal_value?: number;
  period?: "weekly" | "monthly";
  starts_on?: string;
  ends_on?: string;
  status?: "active" | "archived";
  created_at?: string;
  updated_at?: string;
}

export interface GymAnnouncement {
  id: string;
  gym_id: string;
  title: string;
  body: string;
  is_pinned: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface GymAnnouncementInsert {
  id?: string;
  gym_id: string;
  title: string;
  body: string;
  is_pinned?: boolean;
  is_active?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface GymAnnouncementUpdate {
  id?: string;
  gym_id?: string;
  title?: string;
  body?: string;
  is_pinned?: boolean;
  is_active?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface FridgeProduct {
  id: string;
  gym_id: string;
  category: "drinks_fridge" | "meal_prep_fridge" | "protein_candy" | "tclc_merch";
  name: string;
  description: string | null;
  price_cents: number;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface FridgeProductInsert {
  id?: string;
  gym_id: string;
  category?: "drinks_fridge" | "meal_prep_fridge" | "protein_candy" | "tclc_merch";
  name: string;
  description?: string | null;
  price_cents: number;
  is_active?: boolean;
  sort_order?: number;
  created_at?: string;
  updated_at?: string;
}

export interface FridgeProductUpdate {
  id?: string;
  gym_id?: string;
  category?: "drinks_fridge" | "meal_prep_fridge" | "protein_candy" | "tclc_merch";
  name?: string;
  description?: string | null;
  price_cents?: number;
  is_active?: boolean;
  sort_order?: number;
  created_at?: string;
  updated_at?: string;
}

export interface FridgeUnlockSession {
  id: string;
  gym_id: string;
  member_id: string;
  selected_items: Json;
  estimated_total_cents: number;
  status: "pending" | "unlocked" | "confirmed" | "expired" | "canceled";
  qr_token: string;
  expires_at: string;
  created_at: string;
}

export interface FridgeUnlockSessionInsert {
  id?: string;
  gym_id: string;
  member_id: string;
  selected_items?: Json;
  estimated_total_cents: number;
  status?: "pending" | "unlocked" | "confirmed" | "expired" | "canceled";
  qr_token: string;
  expires_at: string;
  created_at?: string;
}

export interface GymMemberSpotlight {
  id: string;
  gym_id: string;
  member_id: string;
  title: string;
  body: string;
  image_url: string | null;
  status: "active" | "archived";
  created_by_user_id: string | null;
  created_at: string;
}

export interface GymMemberSpotlightInsert {
  id?: string;
  gym_id: string;
  member_id: string;
  title: string;
  body: string;
  image_url?: string | null;
  status?: "active" | "archived";
  created_by_user_id?: string | null;
  created_at?: string;
}

export interface GymMemberSpotlightUpdate {
  id?: string;
  gym_id?: string;
  member_id?: string;
  title?: string;
  body?: string;
  image_url?: string | null;
  status?: "active" | "archived";
  created_by_user_id?: string | null;
  created_at?: string;
}

export interface GymShoutout {
  id: string;
  gym_id: string;
  member_id: string | null;
  title: string;
  body: string;
  created_by_user_id: string | null;
  is_pinned: boolean;
  expires_at: string | null;
  created_at: string;
}

export interface GymShoutoutInsert {
  id?: string;
  gym_id: string;
  member_id?: string | null;
  title: string;
  body: string;
  created_by_user_id?: string | null;
  is_pinned?: boolean;
  expires_at?: string | null;
  created_at?: string;
}

export interface GymShoutoutUpdate {
  id?: string;
  gym_id?: string;
  member_id?: string | null;
  title?: string;
  body?: string;
  created_by_user_id?: string | null;
  is_pinned?: boolean;
  expires_at?: string | null;
  created_at?: string;
}

export interface FridgeUnlockSessionUpdate {
  id?: string;
  gym_id?: string;
  member_id?: string;
  selected_items?: Json;
  estimated_total_cents?: number;
  status?: "pending" | "unlocked" | "confirmed" | "expired" | "canceled";
  qr_token?: string;
  expires_at?: string;
  created_at?: string;
}

export interface FridgeAccessEvent {
  id: string;
  gym_id: string;
  member_id: string;
  fridge_unlock_session_id: string;
  fridge_label: string;
  selected_items: Json;
  estimated_total_cents: number;
  status: "pending" | "unlocked" | "confirmed" | "expired" | "canceled";
  created_at: string;
}

export interface FridgeAccessEventInsert {
  id?: string;
  gym_id: string;
  member_id: string;
  fridge_unlock_session_id: string;
  fridge_label?: string;
  selected_items?: Json;
  estimated_total_cents: number;
  status: "pending" | "unlocked" | "confirmed" | "expired" | "canceled";
  created_at?: string;
}

export interface FridgeAccessEventUpdate {
  id?: string;
  gym_id?: string;
  member_id?: string;
  fridge_unlock_session_id?: string;
  fridge_label?: string;
  selected_items?: Json;
  estimated_total_cents?: number;
  status?: "pending" | "unlocked" | "confirmed" | "expired" | "canceled";
  created_at?: string;
}

export interface FridgeOrder {
  id: string;
  gym_id: string;
  member_id: string;
  fridge_unlock_session_id: string;
  subtotal_cents: number;
  status: "pending" | "paid" | "failed" | "canceled";
  stripe_payment_intent_id: string | null;
  receipt: Json;
  created_at: string;
}

export interface FridgeOrderInsert {
  id?: string;
  gym_id: string;
  member_id: string;
  fridge_unlock_session_id: string;
  subtotal_cents: number;
  status?: "pending" | "paid" | "failed" | "canceled";
  stripe_payment_intent_id?: string | null;
  receipt?: Json;
  created_at?: string;
}

export interface FridgeOrderUpdate {
  id?: string;
  gym_id?: string;
  member_id?: string;
  fridge_unlock_session_id?: string;
  subtotal_cents?: number;
  status?: "pending" | "paid" | "failed" | "canceled";
  stripe_payment_intent_id?: string | null;
  receipt?: Json;
  created_at?: string;
}

export interface FridgeOrderItem {
  id: string;
  fridge_order_id: string;
  product_id: string | null;
  product_name: string;
  quantity: number;
  unit_price_cents: number;
  total_price_cents: number;
  created_at: string;
}

export interface FridgeOrderItemInsert {
  id?: string;
  fridge_order_id: string;
  product_id?: string | null;
  product_name: string;
  quantity: number;
  unit_price_cents: number;
  total_price_cents: number;
  created_at?: string;
}

export interface FridgeOrderItemUpdate {
  id?: string;
  fridge_order_id?: string;
  product_id?: string | null;
  product_name?: string;
  quantity?: number;
  unit_price_cents?: number;
  total_price_cents?: number;
  created_at?: string;
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
  date_of_birth: string | null;
  address_line_1: string | null;
  address_line_2: string | null;
  city: string | null;
  state_region: string | null;
  postal_code: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  emergency_contact_relationship: string | null;
  medical_notes: string | null;
  waiver_required: boolean;
  waiver_title: string | null;
  waiver_body: string | null;
  waiver_signature_name: string | null;
  waiver_signed_at: string | null;
  stripe_customer_id: string | null;
  stripe_default_payment_method_id: string | null;
  status: "active" | "frozen" | "canceled" | "lead";
  frozen_until: string | null;
  canceled_at: string | null;
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
  date_of_birth?: string | null;
  address_line_1?: string | null;
  address_line_2?: string | null;
  city?: string | null;
  state_region?: string | null;
  postal_code?: string | null;
  emergency_contact_name?: string | null;
  emergency_contact_phone?: string | null;
  emergency_contact_relationship?: string | null;
  medical_notes?: string | null;
  waiver_required?: boolean;
  waiver_title?: string | null;
  waiver_body?: string | null;
  waiver_signature_name?: string | null;
  waiver_signed_at?: string | null;
  stripe_customer_id?: string | null;
  stripe_default_payment_method_id?: string | null;
  status?: "active" | "frozen" | "canceled" | "lead";
  frozen_until?: string | null;
  canceled_at?: string | null;
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
  date_of_birth?: string | null;
  address_line_1?: string | null;
  address_line_2?: string | null;
  city?: string | null;
  state_region?: string | null;
  postal_code?: string | null;
  emergency_contact_name?: string | null;
  emergency_contact_phone?: string | null;
  emergency_contact_relationship?: string | null;
  medical_notes?: string | null;
  waiver_required?: boolean;
  waiver_title?: string | null;
  waiver_body?: string | null;
  waiver_signature_name?: string | null;
  waiver_signed_at?: string | null;
  stripe_customer_id?: string | null;
  stripe_default_payment_method_id?: string | null;
  status?: "active" | "frozen" | "canceled" | "lead";
  frozen_until?: string | null;
  canceled_at?: string | null;
  joined_at?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface MemberMembershipEvent {
  id: string;
  gym_id: string;
  member_id: string;
  event_type: "frozen" | "canceled";
  reason: string | null;
  frozen_until: string | null;
  created_at: string;
}

export interface MemberMembershipEventInsert {
  id?: string;
  gym_id: string;
  member_id: string;
  event_type: "frozen" | "canceled";
  reason?: string | null;
  frozen_until?: string | null;
  created_at?: string;
}

export interface MemberMembershipEventUpdate {
  id?: string;
  gym_id?: string;
  member_id?: string;
  event_type?: "frozen" | "canceled";
  reason?: string | null;
  frozen_until?: string | null;
  created_at?: string;
}

export interface MemberFreezeReminder {
  id: string;
  gym_id: string;
  member_id: string;
  reminder_type: "one_week" | "two_days";
  frozen_until: string;
  created_at: string;
}

export interface MemberFreezeReminderInsert {
  id?: string;
  gym_id: string;
  member_id: string;
  reminder_type: "one_week" | "two_days";
  frozen_until: string;
  created_at?: string;
}

export interface MemberFreezeReminderUpdate {
  id?: string;
  gym_id?: string;
  member_id?: string;
  reminder_type?: "one_week" | "two_days";
  frozen_until?: string;
  created_at?: string;
}

export interface MemberNote {
  id: string;
  gym_id: string;
  member_id: string;
  author_user_id: string | null;
  body: string;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
}

export interface MemberNoteInsert {
  id?: string;
  gym_id: string;
  member_id: string;
  author_user_id?: string | null;
  body: string;
  is_archived?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface MemberNoteUpdate {
  id?: string;
  gym_id?: string;
  member_id?: string;
  author_user_id?: string | null;
  body?: string;
  is_archived?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface MemberFollowUpTask {
  id: string;
  gym_id: string;
  member_id: string;
  author_user_id: string | null;
  title: string;
  details: string | null;
  task_type: "general" | "billing" | "retention" | "front_desk";
  priority: "low" | "medium" | "high";
  status: "open" | "completed";
  due_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface MemberFollowUpTaskInsert {
  id?: string;
  gym_id: string;
  member_id: string;
  author_user_id?: string | null;
  title: string;
  details?: string | null;
  task_type?: "general" | "billing" | "retention" | "front_desk";
  priority?: "low" | "medium" | "high";
  status?: "open" | "completed";
  due_at?: string | null;
  completed_at?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface MemberFollowUpTaskUpdate {
  id?: string;
  gym_id?: string;
  member_id?: string;
  author_user_id?: string | null;
  title?: string;
  details?: string | null;
  task_type?: "general" | "billing" | "retention" | "front_desk";
  priority?: "low" | "medium" | "high";
  status?: "open" | "completed";
  due_at?: string | null;
  completed_at?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface CheckIn {
  id: string;
  gym_id: string;
  member_id: string;
  schedule_session_id: string | null;
  check_in_method: "manual" | "qr";
  created_at: string;
}

export interface CheckInInsert {
  id?: string;
  gym_id: string;
  member_id: string;
  schedule_session_id?: string | null;
  check_in_method?: "manual" | "qr";
  created_at?: string;
}

export interface CheckInUpdate {
  id?: string;
  gym_id?: string;
  member_id?: string;
  schedule_session_id?: string | null;
  check_in_method?: "manual" | "qr";
  created_at?: string;
}

export type ScheduleSessionVisibility =
  | "member_portal"
  | "website"
  | "public"
  | "staff_only";

export type ScheduleSessionStatus = "active" | "canceled";

export type ScheduleBookingStatus =
  | "booked"
  | "waitlisted"
  | "canceled"
  | "checked_in"
  | "no_show";

export type ScheduleBookingSource =
  | "dashboard"
  | "member_app"
  | "website"
  | "public_widget";

export interface ScheduleProgram {
  id: string;
  gym_id: string;
  name: string;
  description: string | null;
  color: string;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface ScheduleProgramInsert {
  id?: string;
  gym_id: string;
  name: string;
  description?: string | null;
  color?: string;
  is_active?: boolean;
  sort_order?: number;
  created_at?: string;
  updated_at?: string;
}

export interface ScheduleProgramUpdate {
  id?: string;
  gym_id?: string;
  name?: string;
  description?: string | null;
  color?: string;
  is_active?: boolean;
  sort_order?: number;
  created_at?: string;
  updated_at?: string;
}

export interface ScheduleSession {
  id: string;
  gym_id: string;
  program_id: string | null;
  title: string;
  description: string | null;
  instructor_name: string | null;
  location: string | null;
  starts_at: string;
  ends_at: string;
  timezone: string;
  capacity: number | null;
  booking_enabled: boolean;
  waitlist_enabled: boolean;
  visibility: ScheduleSessionVisibility;
  cost_cents: number;
  status: ScheduleSessionStatus;
  cancellation_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface ScheduleSessionInsert {
  id?: string;
  gym_id: string;
  program_id?: string | null;
  title: string;
  description?: string | null;
  instructor_name?: string | null;
  location?: string | null;
  starts_at: string;
  ends_at: string;
  timezone?: string;
  capacity?: number | null;
  booking_enabled?: boolean;
  waitlist_enabled?: boolean;
  visibility?: ScheduleSessionVisibility;
  cost_cents?: number;
  status?: ScheduleSessionStatus;
  cancellation_reason?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface ScheduleSessionUpdate {
  id?: string;
  gym_id?: string;
  program_id?: string | null;
  title?: string;
  description?: string | null;
  instructor_name?: string | null;
  location?: string | null;
  starts_at?: string;
  ends_at?: string;
  timezone?: string;
  capacity?: number | null;
  booking_enabled?: boolean;
  waitlist_enabled?: boolean;
  visibility?: ScheduleSessionVisibility;
  cost_cents?: number;
  status?: ScheduleSessionStatus;
  cancellation_reason?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface ScheduleBooking {
  id: string;
  gym_id: string;
  session_id: string;
  member_id: string | null;
  guest_name: string | null;
  guest_email: string | null;
  guest_phone: string | null;
  status: ScheduleBookingStatus;
  source: ScheduleBookingSource;
  notes: string | null;
  booked_at: string;
  canceled_at: string | null;
  checked_in_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ScheduleBookingInsert {
  id?: string;
  gym_id: string;
  session_id: string;
  member_id?: string | null;
  guest_name?: string | null;
  guest_email?: string | null;
  guest_phone?: string | null;
  status?: ScheduleBookingStatus;
  source?: ScheduleBookingSource;
  notes?: string | null;
  booked_at?: string;
  canceled_at?: string | null;
  checked_in_at?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface ScheduleBookingUpdate {
  id?: string;
  gym_id?: string;
  session_id?: string;
  member_id?: string | null;
  guest_name?: string | null;
  guest_email?: string | null;
  guest_phone?: string | null;
  status?: ScheduleBookingStatus;
  source?: ScheduleBookingSource;
  notes?: string | null;
  booked_at?: string;
  canceled_at?: string | null;
  checked_in_at?: string | null;
  created_at?: string;
  updated_at?: string;
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
  read_at: string | null;
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
  read_at?: string | null;
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
  read_at?: string | null;
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
  status: "succeeded" | "failed" | "pending" | "scheduled" | "overdue" | "refunded";
  paid_at: string | null;
  due_at: string | null;
  invoice_number: string | null;
  description: string | null;
  payment_type: "membership" | "drop_in" | "pos" | "class_fee" | "manual" | "refund_adjustment";
  accounting_category: string;
  late_fee_cents: number;
  tax_cents: number;
  discount_cents: number;
  manual_payment_note: string | null;
  payment_method_label: string | null;
  refunded_amount_cents: number;
  refunded_at: string | null;
  refund_reason: string | null;
  stripe_payment_intent_id: string | null;
  stripe_invoice_id: string | null;
  stripe_refund_id: string | null;
  created_at: string;
}

export interface PaymentInsert {
  id?: string;
  gym_id: string;
  member_id?: string | null;
  subscription_id?: string | null;
  amount_cents: number;
  status?: "succeeded" | "failed" | "pending" | "scheduled" | "overdue" | "refunded";
  paid_at?: string | null;
  due_at?: string | null;
  invoice_number?: string | null;
  description?: string | null;
  payment_type?: "membership" | "drop_in" | "pos" | "class_fee" | "manual" | "refund_adjustment";
  accounting_category?: string;
  late_fee_cents?: number;
  tax_cents?: number;
  discount_cents?: number;
  manual_payment_note?: string | null;
  payment_method_label?: string | null;
  refunded_amount_cents?: number;
  refunded_at?: string | null;
  refund_reason?: string | null;
  stripe_payment_intent_id?: string | null;
  stripe_invoice_id?: string | null;
  stripe_refund_id?: string | null;
  created_at?: string;
}

export interface PaymentUpdate {
  id?: string;
  gym_id?: string;
  member_id?: string | null;
  subscription_id?: string | null;
  amount_cents?: number;
  status?: "succeeded" | "failed" | "pending" | "scheduled" | "overdue" | "refunded";
  paid_at?: string | null;
  due_at?: string | null;
  invoice_number?: string | null;
  description?: string | null;
  payment_type?: "membership" | "drop_in" | "pos" | "class_fee" | "manual" | "refund_adjustment";
  accounting_category?: string;
  late_fee_cents?: number;
  tax_cents?: number;
  discount_cents?: number;
  manual_payment_note?: string | null;
  payment_method_label?: string | null;
  refunded_amount_cents?: number;
  refunded_at?: string | null;
  refund_reason?: string | null;
  stripe_payment_intent_id?: string | null;
  stripe_invoice_id?: string | null;
  stripe_refund_id?: string | null;
  created_at?: string;
}

export interface BillingRetryPolicy {
  id: string;
  gym_id: string;
  retry_offsets_days: number[];
  reminder_offsets_days: number[];
  max_attempts: number;
  final_notice_after_days: number;
  auto_retry_enabled: boolean;
  member_notifications_enabled: boolean;
  daily_report_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface BillingRetryPolicyInsert {
  id?: string;
  gym_id: string;
  retry_offsets_days?: number[];
  reminder_offsets_days?: number[];
  max_attempts?: number;
  final_notice_after_days?: number;
  auto_retry_enabled?: boolean;
  member_notifications_enabled?: boolean;
  daily_report_enabled?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface BillingRetryPolicyUpdate {
  id?: string;
  gym_id?: string;
  retry_offsets_days?: number[];
  reminder_offsets_days?: number[];
  max_attempts?: number;
  final_notice_after_days?: number;
  auto_retry_enabled?: boolean;
  member_notifications_enabled?: boolean;
  daily_report_enabled?: boolean;
  created_at?: string;
  updated_at?: string;
}

export type BillingRecoveryCaseReason =
  | "failed_payment"
  | "past_due_subscription"
  | "missing_card"
  | "overdue_payment";

export type BillingRecoveryCaseStatus =
  | "open"
  | "retrying"
  | "waiting_on_member"
  | "resolved"
  | "closed";

export type BillingRecoveryPriority = "low" | "medium" | "high" | "critical";

export interface BillingRecoveryCase {
  id: string;
  gym_id: string;
  member_id: string | null;
  subscription_id: string | null;
  payment_id: string | null;
  reason: BillingRecoveryCaseReason;
  status: BillingRecoveryCaseStatus;
  priority: BillingRecoveryPriority;
  amount_cents: number;
  retry_count: number;
  max_retries: number;
  first_failed_at: string | null;
  next_retry_at: string | null;
  last_retry_at: string | null;
  last_reminder_at: string | null;
  final_notice_at: string | null;
  resolved_at: string | null;
  resolution_note: string | null;
  stripe_invoice_id: string | null;
  stripe_payment_intent_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface BillingRecoveryCaseInsert {
  id?: string;
  gym_id: string;
  member_id?: string | null;
  subscription_id?: string | null;
  payment_id?: string | null;
  reason: BillingRecoveryCaseReason;
  status?: BillingRecoveryCaseStatus;
  priority?: BillingRecoveryPriority;
  amount_cents?: number;
  retry_count?: number;
  max_retries?: number;
  first_failed_at?: string | null;
  next_retry_at?: string | null;
  last_retry_at?: string | null;
  last_reminder_at?: string | null;
  final_notice_at?: string | null;
  resolved_at?: string | null;
  resolution_note?: string | null;
  stripe_invoice_id?: string | null;
  stripe_payment_intent_id?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface BillingRecoveryCaseUpdate {
  id?: string;
  gym_id?: string;
  member_id?: string | null;
  subscription_id?: string | null;
  payment_id?: string | null;
  reason?: BillingRecoveryCaseReason;
  status?: BillingRecoveryCaseStatus;
  priority?: BillingRecoveryPriority;
  amount_cents?: number;
  retry_count?: number;
  max_retries?: number;
  first_failed_at?: string | null;
  next_retry_at?: string | null;
  last_retry_at?: string | null;
  last_reminder_at?: string | null;
  final_notice_at?: string | null;
  resolved_at?: string | null;
  resolution_note?: string | null;
  stripe_invoice_id?: string | null;
  stripe_payment_intent_id?: string | null;
  created_at?: string;
  updated_at?: string;
}

export type BillingRecoveryAttemptAction =
  | "retry_charge"
  | "send_reminder"
  | "final_notice"
  | "manual_note"
  | "mark_resolved"
  | "refund";

export type BillingRecoveryAttemptStatus =
  | "scheduled"
  | "processing"
  | "succeeded"
  | "failed"
  | "skipped";

export interface BillingRecoveryAttempt {
  id: string;
  gym_id: string;
  case_id: string;
  payment_id: string | null;
  member_id: string | null;
  attempt_number: number;
  action: BillingRecoveryAttemptAction;
  status: BillingRecoveryAttemptStatus;
  scheduled_at: string | null;
  processed_at: string | null;
  amount_cents: number;
  result_message: string | null;
  stripe_invoice_id: string | null;
  stripe_payment_intent_id: string | null;
  idempotency_key: string | null;
  created_at: string;
}

export interface BillingRecoveryAttemptInsert {
  id?: string;
  gym_id: string;
  case_id: string;
  payment_id?: string | null;
  member_id?: string | null;
  attempt_number?: number;
  action: BillingRecoveryAttemptAction;
  status?: BillingRecoveryAttemptStatus;
  scheduled_at?: string | null;
  processed_at?: string | null;
  amount_cents?: number;
  result_message?: string | null;
  stripe_invoice_id?: string | null;
  stripe_payment_intent_id?: string | null;
  idempotency_key?: string | null;
  created_at?: string;
}

export interface BillingRecoveryAttemptUpdate {
  id?: string;
  gym_id?: string;
  case_id?: string;
  payment_id?: string | null;
  member_id?: string | null;
  attempt_number?: number;
  action?: BillingRecoveryAttemptAction;
  status?: BillingRecoveryAttemptStatus;
  scheduled_at?: string | null;
  processed_at?: string | null;
  amount_cents?: number;
  result_message?: string | null;
  stripe_invoice_id?: string | null;
  stripe_payment_intent_id?: string | null;
  idempotency_key?: string | null;
  created_at?: string;
}

export interface BillingDailyReport {
  id: string;
  gym_id: string;
  report_date: string;
  metrics: Json;
  created_at: string;
}

export interface BillingDailyReportInsert {
  id?: string;
  gym_id: string;
  report_date: string;
  metrics?: Json;
  created_at?: string;
}

export interface BillingDailyReportUpdate {
  id?: string;
  gym_id?: string;
  report_date?: string;
  metrics?: Json;
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

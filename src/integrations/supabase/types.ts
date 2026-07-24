export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      actions: {
        Row: {
          completed_date: string | null
          created_at: string
          description: string | null
          due_date: string | null
          id: string
          notes: string | null
          org_id: string
          owner: string | null
          priority: string | null
          project_id: string
          status: string | null
          title: string
          updated_at: string
        }
        Insert: {
          completed_date?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          notes?: string | null
          org_id: string
          owner?: string | null
          priority?: string | null
          project_id: string
          status?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          completed_date?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          notes?: string | null
          org_id?: string
          owner?: string | null
          priority?: string | null
          project_id?: string
          status?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "actions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "actions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          created_at: string
          details: Json | null
          entity_id: string | null
          entity_type: string | null
          id: string
          org_id: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          org_id?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          org_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      benefits: {
        Row: {
          benefit_type: string | null
          created_at: string
          id: string
          notes: string | null
          org_id: string
          owner: string | null
          project_id: string
          realisation_date: string | null
          realised_value: number | null
          status: string | null
          target_value: number | null
          title: string
          updated_at: string
        }
        Insert: {
          benefit_type?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          org_id: string
          owner?: string | null
          project_id: string
          realisation_date?: string | null
          realised_value?: number | null
          status?: string | null
          target_value?: number | null
          title: string
          updated_at?: string
        }
        Update: {
          benefit_type?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          org_id?: string
          owner?: string | null
          project_id?: string
          realisation_date?: string | null
          realised_value?: number | null
          status?: string | null
          target_value?: number | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "benefits_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "benefits_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_plans: {
        Row: {
          active: boolean
          code: string
          created_at: string
          currency: string
          description: string | null
          features: Json
          id: string
          interval: string
          max_projects: number | null
          max_users: number | null
          name: string
          price_cents: number
          sort_order: number
          stripe_price_id: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          currency?: string
          description?: string | null
          features?: Json
          id?: string
          interval?: string
          max_projects?: number | null
          max_users?: number | null
          name: string
          price_cents?: number
          sort_order?: number
          stripe_price_id?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          currency?: string
          description?: string | null
          features?: Json
          id?: string
          interval?: string
          max_projects?: number | null
          max_users?: number | null
          name?: string
          price_cents?: number
          sort_order?: number
          stripe_price_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      business_units: {
        Row: {
          code: string | null
          created_at: string
          id: string
          name: string
          org_id: string
          updated_at: string
        }
        Insert: {
          code?: string | null
          created_at?: string
          id?: string
          name: string
          org_id: string
          updated_at?: string
        }
        Update: {
          code?: string | null
          created_at?: string
          id?: string
          name?: string
          org_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_units_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      change_requests: {
        Row: {
          approver: string | null
          change_type: string | null
          cr_number: string | null
          created_at: string
          decision_date: string | null
          description: string | null
          id: string
          impact_cost: number | null
          impact_schedule_days: number | null
          impact_scope: string | null
          notes: string | null
          org_id: string
          owner: string | null
          project_id: string
          raised_by: string | null
          raised_date: string | null
          status: string | null
          title: string
          updated_at: string
        }
        Insert: {
          approver?: string | null
          change_type?: string | null
          cr_number?: string | null
          created_at?: string
          decision_date?: string | null
          description?: string | null
          id?: string
          impact_cost?: number | null
          impact_schedule_days?: number | null
          impact_scope?: string | null
          notes?: string | null
          org_id: string
          owner?: string | null
          project_id: string
          raised_by?: string | null
          raised_date?: string | null
          status?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          approver?: string | null
          change_type?: string | null
          cr_number?: string | null
          created_at?: string
          decision_date?: string | null
          description?: string | null
          id?: string
          impact_cost?: number | null
          impact_schedule_days?: number | null
          impact_scope?: string | null
          notes?: string | null
          org_id?: string
          owner?: string | null
          project_id?: string
          raised_by?: string | null
          raised_date?: string | null
          status?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "change_requests_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "change_requests_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      decisions: {
        Row: {
          approval_requested_at: string | null
          approved_at: string | null
          approved_by: string | null
          approver_user_id: string | null
          approvers: string | null
          created_at: string
          decided_by: string | null
          decision_date: string | null
          description: string | null
          forum: string | null
          id: string
          impact: string | null
          notes: string | null
          org_id: string
          outcome: string | null
          owner: string | null
          program: string | null
          project_id: string
          rationale: string | null
          sponsor: string | null
          stage_gate_id: string | null
          status: string | null
          title: string
          updated_at: string
        }
        Insert: {
          approval_requested_at?: string | null
          approved_at?: string | null
          approved_by?: string | null
          approver_user_id?: string | null
          approvers?: string | null
          created_at?: string
          decided_by?: string | null
          decision_date?: string | null
          description?: string | null
          forum?: string | null
          id?: string
          impact?: string | null
          notes?: string | null
          org_id: string
          outcome?: string | null
          owner?: string | null
          program?: string | null
          project_id: string
          rationale?: string | null
          sponsor?: string | null
          stage_gate_id?: string | null
          status?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          approval_requested_at?: string | null
          approved_at?: string | null
          approved_by?: string | null
          approver_user_id?: string | null
          approvers?: string | null
          created_at?: string
          decided_by?: string | null
          decision_date?: string | null
          description?: string | null
          forum?: string | null
          id?: string
          impact?: string | null
          notes?: string | null
          org_id?: string
          outcome?: string | null
          owner?: string | null
          program?: string | null
          project_id?: string
          rationale?: string | null
          sponsor?: string | null
          stage_gate_id?: string | null
          status?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "decisions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "decisions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "decisions_stage_gate_id_fkey"
            columns: ["stage_gate_id"]
            isOneToOne: false
            referencedRelation: "stage_gates"
            referencedColumns: ["id"]
          },
        ]
      }
      demand_pipeline: {
        Row: {
          bu_id: string | null
          complexity: number | null
          created_at: string
          description: string | null
          estimated_benefit: number | null
          estimated_cost: number | null
          estimated_roi: number | null
          id: string
          idea_name: string
          org_id: string
          sponsor: string | null
          status: string | null
          strategic_alignment: number | null
          submitted_date: string | null
          updated_at: string
        }
        Insert: {
          bu_id?: string | null
          complexity?: number | null
          created_at?: string
          description?: string | null
          estimated_benefit?: number | null
          estimated_cost?: number | null
          estimated_roi?: number | null
          id?: string
          idea_name: string
          org_id: string
          sponsor?: string | null
          status?: string | null
          strategic_alignment?: number | null
          submitted_date?: string | null
          updated_at?: string
        }
        Update: {
          bu_id?: string | null
          complexity?: number | null
          created_at?: string
          description?: string | null
          estimated_benefit?: number | null
          estimated_cost?: number | null
          estimated_roi?: number | null
          id?: string
          idea_name?: string
          org_id?: string
          sponsor?: string | null
          status?: string | null
          strategic_alignment?: number | null
          submitted_date?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "demand_pipeline_bu_id_fkey"
            columns: ["bu_id"]
            isOneToOne: false
            referencedRelation: "business_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "demand_pipeline_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      dependencies: {
        Row: {
          created_at: string
          dep_type: string | null
          depends_on_project_id: string | null
          description: string | null
          id: string
          needed_by: string | null
          org_id: string
          owner: string | null
          project_id: string
          status: string | null
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          dep_type?: string | null
          depends_on_project_id?: string | null
          description?: string | null
          id?: string
          needed_by?: string | null
          org_id: string
          owner?: string | null
          project_id: string
          status?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          dep_type?: string | null
          depends_on_project_id?: string | null
          description?: string | null
          id?: string
          needed_by?: string | null
          org_id?: string
          owner?: string | null
          project_id?: string
          status?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dependencies_depends_on_project_id_fkey"
            columns: ["depends_on_project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dependencies_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dependencies_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          created_at: string
          doc_type: string | null
          id: string
          name: string
          org_id: string
          owner: string | null
          project_id: string | null
          updated_at: string
          uploaded_date: string | null
          url: string | null
          version: string | null
        }
        Insert: {
          created_at?: string
          doc_type?: string | null
          id?: string
          name: string
          org_id: string
          owner?: string | null
          project_id?: string | null
          updated_at?: string
          uploaded_date?: string | null
          url?: string | null
          version?: string | null
        }
        Update: {
          created_at?: string
          doc_type?: string | null
          id?: string
          name?: string
          org_id?: string
          owner?: string | null
          project_id?: string | null
          updated_at?: string
          uploaded_date?: string | null
          url?: string | null
          version?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "documents_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      financials_monthly: {
        Row: {
          benefits_actual: number | null
          benefits_planned: number | null
          capex_actual: number | null
          capex_forecast: number | null
          capex_planned: number | null
          created_at: string
          id: string
          opex_actual: number | null
          opex_forecast: number | null
          opex_planned: number | null
          org_id: string
          period_month: string
          project_id: string
          stream_id: string | null
          updated_at: string
        }
        Insert: {
          benefits_actual?: number | null
          benefits_planned?: number | null
          capex_actual?: number | null
          capex_forecast?: number | null
          capex_planned?: number | null
          created_at?: string
          id?: string
          opex_actual?: number | null
          opex_forecast?: number | null
          opex_planned?: number | null
          org_id: string
          period_month: string
          project_id: string
          stream_id?: string | null
          updated_at?: string
        }
        Update: {
          benefits_actual?: number | null
          benefits_planned?: number | null
          capex_actual?: number | null
          capex_forecast?: number | null
          capex_planned?: number | null
          created_at?: string
          id?: string
          opex_actual?: number | null
          opex_forecast?: number | null
          opex_planned?: number | null
          org_id?: string
          period_month?: string
          project_id?: string
          stream_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "financials_monthly_stream_id_fkey"
            columns: ["stream_id"]
            isOneToOne: false
            referencedRelation: "project_streams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financials_monthly_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financials_monthly_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      fy_allocations: {
        Row: {
          benefits: number | null
          budget: number | null
          capex: number | null
          created_at: string
          forecast: number | null
          fy: string
          id: string
          opex: number | null
          org_id: string
          project_id: string
          stream_id: string | null
          updated_at: string
        }
        Insert: {
          benefits?: number | null
          budget?: number | null
          capex?: number | null
          created_at?: string
          forecast?: number | null
          fy: string
          id?: string
          opex?: number | null
          org_id: string
          project_id: string
          stream_id?: string | null
          updated_at?: string
        }
        Update: {
          benefits?: number | null
          budget?: number | null
          capex?: number | null
          created_at?: string
          forecast?: number | null
          fy?: string
          id?: string
          opex?: number | null
          org_id?: string
          project_id?: string
          stream_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fy_allocations_stream_id_fkey"
            columns: ["stream_id"]
            isOneToOne: false
            referencedRelation: "project_streams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fy_allocations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fy_allocations_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      governance_channels: {
        Row: {
          audience: string | null
          cadence: string | null
          chair: string | null
          created_at: string
          id: string
          name: string
          next_meeting: string | null
          org_id: string
          purpose: string | null
          status: string | null
          updated_at: string
        }
        Insert: {
          audience?: string | null
          cadence?: string | null
          chair?: string | null
          created_at?: string
          id?: string
          name: string
          next_meeting?: string | null
          org_id: string
          purpose?: string | null
          status?: string | null
          updated_at?: string
        }
        Update: {
          audience?: string | null
          cadence?: string | null
          chair?: string | null
          created_at?: string
          id?: string
          name?: string
          next_meeting?: string | null
          org_id?: string
          purpose?: string | null
          status?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "governance_channels_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_payments: {
        Row: {
          amount_cents: number
          created_at: string
          currency: string
          id: string
          invoice_id: string
          method: string | null
          paid_at: string
          recorded_by: string | null
          reference: string | null
          stripe_payment_intent_id: string | null
        }
        Insert: {
          amount_cents: number
          created_at?: string
          currency?: string
          id?: string
          invoice_id: string
          method?: string | null
          paid_at?: string
          recorded_by?: string | null
          reference?: string | null
          stripe_payment_intent_id?: string | null
        }
        Update: {
          amount_cents?: number
          created_at?: string
          currency?: string
          id?: string
          invoice_id?: string
          method?: string | null
          paid_at?: string
          recorded_by?: string | null
          reference?: string | null
          stripe_payment_intent_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoice_payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          amount_cents: number
          created_at: string
          currency: string
          due_date: string
          email_last_error: string | null
          emailed_at: string | null
          id: string
          invoice_number: string
          issue_date: string
          line_items: Json
          notes: string | null
          org_id: string
          paid_date: string | null
          period_end: string | null
          period_start: string | null
          status: string
          stripe_hosted_url: string | null
          stripe_invoice_id: string | null
          subscription_id: string | null
          updated_at: string
        }
        Insert: {
          amount_cents: number
          created_at?: string
          currency?: string
          due_date?: string
          email_last_error?: string | null
          emailed_at?: string | null
          id?: string
          invoice_number: string
          issue_date?: string
          line_items?: Json
          notes?: string | null
          org_id: string
          paid_date?: string | null
          period_end?: string | null
          period_start?: string | null
          status?: string
          stripe_hosted_url?: string | null
          stripe_invoice_id?: string | null
          subscription_id?: string | null
          updated_at?: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          currency?: string
          due_date?: string
          email_last_error?: string | null
          emailed_at?: string | null
          id?: string
          invoice_number?: string
          issue_date?: string
          line_items?: Json
          notes?: string | null
          org_id?: string
          paid_date?: string | null
          period_end?: string | null
          period_start?: string | null
          status?: string
          stripe_hosted_url?: string | null
          stripe_invoice_id?: string | null
          subscription_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      issues: {
        Row: {
          created_at: string
          description: string | null
          id: string
          org_id: string
          owner: string | null
          priority: string | null
          project_id: string
          raised_date: string | null
          resolution: string | null
          resolved_date: string | null
          status: string | null
          target_date: string | null
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          org_id: string
          owner?: string | null
          priority?: string | null
          project_id: string
          raised_date?: string | null
          resolution?: string | null
          resolved_date?: string | null
          status?: string | null
          target_date?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          org_id?: string
          owner?: string | null
          priority?: string | null
          project_id?: string
          raised_date?: string | null
          resolution?: string | null
          resolved_date?: string | null
          status?: string | null
          target_date?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "issues_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "issues_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      landing_config: {
        Row: {
          config: Json
          id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          config?: Json
          id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          config?: Json
          id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      invoice_template_config: {
        Row: {
          config: Json
          id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          config?: Json
          id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          config?: Json
          id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      lessons_learned: {
        Row: {
          captured_by: string | null
          captured_date: string | null
          category: string | null
          created_at: string
          id: string
          org_id: string
          project_id: string | null
          recommendation: string | null
          root_cause: string | null
          updated_at: string
          what_happened: string | null
        }
        Insert: {
          captured_by?: string | null
          captured_date?: string | null
          category?: string | null
          created_at?: string
          id?: string
          org_id: string
          project_id?: string | null
          recommendation?: string | null
          root_cause?: string | null
          updated_at?: string
          what_happened?: string | null
        }
        Update: {
          captured_by?: string | null
          captured_date?: string | null
          category?: string | null
          created_at?: string
          id?: string
          org_id?: string
          project_id?: string | null
          recommendation?: string | null
          root_cause?: string | null
          updated_at?: string
          what_happened?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lessons_learned_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lessons_learned_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      milestones: {
        Row: {
          actual_date: string | null
          created_at: string
          id: string
          name: string
          notes: string | null
          org_id: string
          owner: string | null
          planned_date: string | null
          project_id: string
          stream_id: string | null
          stage_gate_id: string | null
          status: string | null
          updated_at: string
        }
        Insert: {
          actual_date?: string | null
          created_at?: string
          id?: string
          name: string
          notes?: string | null
          org_id: string
          owner?: string | null
          planned_date?: string | null
          project_id: string
          stream_id?: string | null
          stage_gate_id?: string | null
          status?: string | null
          updated_at?: string
        }
        Update: {
          actual_date?: string | null
          created_at?: string
          id?: string
          name?: string
          notes?: string | null
          org_id?: string
          owner?: string | null
          planned_date?: string | null
          project_id?: string
          stream_id?: string | null
          stage_gate_id?: string | null
          status?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "milestones_stream_id_fkey"
            columns: ["stream_id"]
            isOneToOne: false
            referencedRelation: "project_streams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "milestones_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "milestones_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "milestones_stage_gate_id_fkey"
            columns: ["stage_gate_id"]
            isOneToOne: true
            referencedRelation: "stage_gates"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          kind: string
          link: string | null
          org_id: string | null
          read_at: string | null
          title: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          kind: string
          link?: string | null
          org_id?: string | null
          read_at?: string | null
          title: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          kind?: string
          link?: string | null
          org_id?: string | null
          read_at?: string | null
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          accent_color: string | null
          billing_email: string | null
          brand_name: string | null
          created_at: string
          fy_start_month: number
          id: string
          logo_url: string | null
          name: string
          override_max_projects: number | null
          override_max_users: number | null
          palette: Json
          plan: string
          primary_color: string | null
          slug: string
          ui_config: Json
          updated_at: string
        }
        Insert: {
          accent_color?: string | null
          billing_email?: string | null
          brand_name?: string | null
          created_at?: string
          fy_start_month?: number
          id?: string
          logo_url?: string | null
          name: string
          override_max_projects?: number | null
          override_max_users?: number | null
          palette?: Json
          plan?: string
          primary_color?: string | null
          slug: string
          ui_config?: Json
          updated_at?: string
        }
        Update: {
          accent_color?: string | null
          billing_email?: string | null
          brand_name?: string | null
          created_at?: string
          fy_start_month?: number
          id?: string
          logo_url?: string | null
          name?: string
          override_max_projects?: number | null
          override_max_users?: number | null
          palette?: Json
          plan?: string
          primary_color?: string | null
          slug?: string
          ui_config?: Json
          updated_at?: string
        }
        Relationships: []
      }
      platform_expenses: {
        Row: {
          amount_cents: number
          category: string
          created_at: string
          created_by: string | null
          currency: string
          description: string
          expense_date: string
          id: string
          notes: string | null
          recurring: boolean
          updated_at: string
          vendor: string | null
        }
        Insert: {
          amount_cents: number
          category: string
          created_at?: string
          created_by?: string | null
          currency?: string
          description: string
          expense_date?: string
          id?: string
          notes?: string | null
          recurring?: boolean
          updated_at?: string
          vendor?: string | null
        }
        Update: {
          amount_cents?: number
          category?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          description?: string
          expense_date?: string
          id?: string
          notes?: string | null
          recurring?: boolean
          updated_at?: string
          vendor?: string | null
        }
        Relationships: []
      }
      portfolio_scenarios: {
        Row: {
          budget_cap: number | null
          config: Json | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          name: string
          org_id: string
          updated_at: string
        }
        Insert: {
          budget_cap?: number | null
          config?: Json | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name: string
          org_id: string
          updated_at?: string
        }
        Update: {
          budget_cap?: number | null
          config?: Json | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string
          org_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "portfolio_scenarios_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string
          full_name: string | null
          id: string
          is_active: boolean
          must_change_password: boolean
          org_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          full_name?: string | null
          id: string
          is_active?: boolean
          must_change_password?: boolean
          org_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          is_active?: boolean
          must_change_password?: boolean
          org_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }

      project_streams: {
        Row: {
          actual_end_date: string | null
          actual_start_date: string | null
          budget: number | null
          capex_approved: number | null
          capex_incurred: number | null
          code: string | null
          created_at: string
          description: string | null
          forecast_at_completion: number | null
          id: string
          is_default: boolean
          name: string
          notes: string | null
          opex_approved: number | null
          opex_incurred: number | null
          org_id: string
          owner: string | null
          planned_end_date: string | null
          planned_start_date: string | null
          project_id: string
          rag: string | null
          sort_order: number
          status: string | null
          updated_at: string
        }
        Insert: {
          actual_end_date?: string | null
          actual_start_date?: string | null
          budget?: number | null
          capex_approved?: number | null
          capex_incurred?: number | null
          code?: string | null
          created_at?: string
          description?: string | null
          forecast_at_completion?: number | null
          id?: string
          is_default?: boolean
          name: string
          notes?: string | null
          opex_approved?: number | null
          opex_incurred?: number | null
          org_id: string
          owner?: string | null
          planned_end_date?: string | null
          planned_start_date?: string | null
          project_id: string
          rag?: string | null
          sort_order?: number
          status?: string | null
          updated_at?: string
        }
        Update: {
          actual_end_date?: string | null
          actual_start_date?: string | null
          budget?: number | null
          capex_approved?: number | null
          capex_incurred?: number | null
          code?: string | null
          created_at?: string
          description?: string | null
          forecast_at_completion?: number | null
          id?: string
          is_default?: boolean
          name?: string
          notes?: string | null
          opex_approved?: number | null
          opex_incurred?: number | null
          org_id?: string
          owner?: string | null
          planned_end_date?: string | null
          planned_start_date?: string | null
          project_id?: string
          rag?: string | null
          sort_order?: number
          status?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_streams_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_streams_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          actual_end_date: string | null
          actual_start_date: string | null
          baseline_benefits: number | null
          baseline_budget: number | null
          baseline_capex: number | null
          baseline_date: string | null
          baseline_label: string | null
          baseline_opex: number | null
          benefits_realised: number | null
          benefits_target: number | null
          brief: Json
          bu_id: string | null
          budget: number | null
          capex_approved: number | null
          capex_incurred: number | null
          created_at: string
          current_phase: string | null
          delivery_method: Database["public"]["Enums"]["delivery_method"] | null
          description: string | null
          end_date: string | null
          forecast_at_completion: number | null
          id: string
          name: string
          opex_approved: number | null
          opex_incurred: number | null
          org_id: string
          planned_end_date: string | null
          planned_start_date: string | null
          pm_user_id: string | null
          portfolio: string | null
          priority: string | null
          program: string | null
          project_code: string | null
          rag: Database["public"]["Enums"]["project_rag"] | null
          roi_percent: number | null
          sponsor: string | null
          start_date: string | null
          status: Database["public"]["Enums"]["project_status"] | null
          streams_enabled: boolean
          target_go_live: string | null
          updated_at: string
        }
        Insert: {
          actual_end_date?: string | null
          actual_start_date?: string | null
          baseline_benefits?: number | null
          baseline_budget?: number | null
          baseline_capex?: number | null
          baseline_date?: string | null
          baseline_label?: string | null
          baseline_opex?: number | null
          benefits_realised?: number | null
          benefits_target?: number | null
          brief?: Json
          bu_id?: string | null
          budget?: number | null
          capex_approved?: number | null
          capex_incurred?: number | null
          created_at?: string
          current_phase?: string | null
          delivery_method?:
            | Database["public"]["Enums"]["delivery_method"]
            | null
          description?: string | null
          end_date?: string | null
          forecast_at_completion?: number | null
          id?: string
          name: string
          opex_approved?: number | null
          opex_incurred?: number | null
          org_id: string
          planned_end_date?: string | null
          planned_start_date?: string | null
          pm_user_id?: string | null
          portfolio?: string | null
          priority?: string | null
          program?: string | null
          project_code?: string | null
          rag?: Database["public"]["Enums"]["project_rag"] | null
          roi_percent?: number | null
          sponsor?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["project_status"] | null
          streams_enabled?: boolean
          target_go_live?: string | null
          updated_at?: string
        }
        Update: {
          actual_end_date?: string | null
          actual_start_date?: string | null
          baseline_benefits?: number | null
          baseline_budget?: number | null
          baseline_capex?: number | null
          baseline_date?: string | null
          baseline_label?: string | null
          baseline_opex?: number | null
          benefits_realised?: number | null
          benefits_target?: number | null
          brief?: Json
          bu_id?: string | null
          budget?: number | null
          capex_approved?: number | null
          capex_incurred?: number | null
          created_at?: string
          current_phase?: string | null
          delivery_method?:
            | Database["public"]["Enums"]["delivery_method"]
            | null
          description?: string | null
          end_date?: string | null
          forecast_at_completion?: number | null
          id?: string
          name?: string
          opex_approved?: number | null
          opex_incurred?: number | null
          org_id?: string
          planned_end_date?: string | null
          planned_start_date?: string | null
          pm_user_id?: string | null
          portfolio?: string | null
          priority?: string | null
          program?: string | null
          project_code?: string | null
          rag?: Database["public"]["Enums"]["project_rag"] | null
          roi_percent?: number | null
          sponsor?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["project_status"] | null
          streams_enabled?: boolean
          target_go_live?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_bu_id_fkey"
            columns: ["bu_id"]
            isOneToOne: false
            referencedRelation: "business_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      resource_allocations: {
        Row: {
          allocated_hours: number | null
          allocation_percent: number | null
          created_at: string
          id: string
          org_id: string
          period_month: string
          project_id: string
          stream_id: string | null
          resource_id: string
          role_on_project: string | null
          updated_at: string
        }
        Insert: {
          allocated_hours?: number | null
          allocation_percent?: number | null
          created_at?: string
          id?: string
          org_id: string
          period_month: string
          project_id: string
          stream_id?: string | null
          resource_id: string
          role_on_project?: string | null
          updated_at?: string
        }
        Update: {
          allocated_hours?: number | null
          allocation_percent?: number | null
          created_at?: string
          id?: string
          org_id?: string
          period_month?: string
          project_id?: string
          stream_id?: string | null
          resource_id?: string
          role_on_project?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "resource_allocations_stream_id_fkey"
            columns: ["stream_id"]
            isOneToOne: false
            referencedRelation: "project_streams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resource_allocations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resource_allocations_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resource_allocations_resource_id_fkey"
            columns: ["resource_id"]
            isOneToOne: false
            referencedRelation: "resources"
            referencedColumns: ["id"]
          },
        ]
      }
      resources: {
        Row: {
          bu_id: string | null
          capacity_hours_week: number | null
          cost_rate: number | null
          created_at: string
          email: string | null
          id: string
          location: string | null
          name: string
          org_id: string
          role: string | null
          skills: string | null
          status: string | null
          updated_at: string
        }
        Insert: {
          bu_id?: string | null
          capacity_hours_week?: number | null
          cost_rate?: number | null
          created_at?: string
          email?: string | null
          id?: string
          location?: string | null
          name: string
          org_id: string
          role?: string | null
          skills?: string | null
          status?: string | null
          updated_at?: string
        }
        Update: {
          bu_id?: string | null
          capacity_hours_week?: number | null
          cost_rate?: number | null
          created_at?: string
          email?: string | null
          id?: string
          location?: string | null
          name?: string
          org_id?: string
          role?: string | null
          skills?: string | null
          status?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "resources_bu_id_fkey"
            columns: ["bu_id"]
            isOneToOne: false
            referencedRelation: "business_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resources_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      risks: {
        Row: {
          category: string | null
          created_at: string
          description: string | null
          due_date: string | null
          id: string
          impact: number | null
          mitigation: string | null
          notes: string | null
          org_id: string
          owner: string | null
          probability: number | null
          project_id: string
          severity: number | null
          status: string | null
          title: string
          updated_at: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          impact?: number | null
          mitigation?: string | null
          notes?: string | null
          org_id: string
          owner?: string | null
          probability?: number | null
          project_id: string
          severity?: number | null
          status?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          category?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          impact?: number | null
          mitigation?: string | null
          notes?: string | null
          org_id?: string
          owner?: string | null
          probability?: number | null
          project_id?: string
          severity?: number | null
          status?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "risks_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "risks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      role_table_permissions: {
        Row: {
          can_edit: boolean
          can_view: boolean
          created_at: string
          id: string
          org_id: string
          role: Database["public"]["Enums"]["app_role"]
          table_name: string
          updated_at: string
        }
        Insert: {
          can_edit?: boolean
          can_view?: boolean
          created_at?: string
          id?: string
          org_id: string
          role: Database["public"]["Enums"]["app_role"]
          table_name: string
          updated_at?: string
        }
        Update: {
          can_edit?: boolean
          can_view?: boolean
          created_at?: string
          id?: string
          org_id?: string
          role?: Database["public"]["Enums"]["app_role"]
          table_name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_table_permissions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      scenario_projects: {
        Row: {
          adjusted_budget: number | null
          adjusted_end: string | null
          adjusted_start: string | null
          created_at: string
          id: string
          included: boolean | null
          org_id: string
          priority_score: number | null
          project_id: string
          scenario_id: string
          updated_at: string
        }
        Insert: {
          adjusted_budget?: number | null
          adjusted_end?: string | null
          adjusted_start?: string | null
          created_at?: string
          id?: string
          included?: boolean | null
          org_id: string
          priority_score?: number | null
          project_id: string
          scenario_id: string
          updated_at?: string
        }
        Update: {
          adjusted_budget?: number | null
          adjusted_end?: string | null
          adjusted_start?: string | null
          created_at?: string
          id?: string
          included?: boolean | null
          org_id?: string
          priority_score?: number | null
          project_id?: string
          scenario_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "scenario_projects_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scenario_projects_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scenario_projects_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: false
            referencedRelation: "portfolio_scenarios"
            referencedColumns: ["id"]
          },
        ]
      }
      sprints: {
        Row: {
          committed_stories: number | null
          completed_points: number | null
          completed_stories: number | null
          created_at: string
          end_date: string | null
          id: string
          name: string | null
          notes: string | null
          org_id: string
          planned_points: number | null
          project_id: string
          sprint_number: number | null
          start_date: string | null
          status: string | null
          updated_at: string
        }
        Insert: {
          committed_stories?: number | null
          completed_points?: number | null
          completed_stories?: number | null
          created_at?: string
          end_date?: string | null
          id?: string
          name?: string | null
          notes?: string | null
          org_id: string
          planned_points?: number | null
          project_id: string
          sprint_number?: number | null
          start_date?: string | null
          status?: string | null
          updated_at?: string
        }
        Update: {
          committed_stories?: number | null
          completed_points?: number | null
          completed_stories?: number | null
          created_at?: string
          end_date?: string | null
          id?: string
          name?: string | null
          notes?: string | null
          org_id?: string
          planned_points?: number | null
          project_id?: string
          sprint_number?: number | null
          start_date?: string | null
          status?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sprints_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sprints_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      stage_gate_definitions: {
        Row: {
          created_at: string
          gate_name: string
          id: string
          is_active: boolean
          org_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          gate_name: string
          id?: string
          is_active?: boolean
          org_id: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          gate_name?: string
          id?: string
          is_active?: boolean
          org_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stage_gate_definitions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      stage_gates: {
        Row: {
          actual_date: string | null
          approver: string | null
          created_at: string
          gate_name: string
          id: string
          notes: string | null
          org_id: string
          planned_date: string | null
          project_id: string
          stream_id: string | null
          status: string | null
          updated_at: string
        }
        Insert: {
          actual_date?: string | null
          approver?: string | null
          created_at?: string
          gate_name: string
          id?: string
          notes?: string | null
          org_id: string
          planned_date?: string | null
          project_id: string
          stream_id?: string | null
          status?: string | null
          updated_at?: string
        }
        Update: {
          actual_date?: string | null
          approver?: string | null
          created_at?: string
          gate_name?: string
          id?: string
          notes?: string | null
          org_id?: string
          planned_date?: string | null
          project_id?: string
          stream_id?: string | null
          status?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stage_gates_stream_id_fkey"
            columns: ["stream_id"]
            isOneToOne: false
            referencedRelation: "project_streams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stage_gates_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stage_gates_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      stakeholders: {
        Row: {
          created_at: string
          email: string | null
          engagement_strategy: string | null
          id: string
          influence: string | null
          interest: string | null
          name: string
          org_id: string
          project_id: string
          role: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          engagement_strategy?: string | null
          id?: string
          influence?: string | null
          interest?: string | null
          name: string
          org_id: string
          project_id: string
          role?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          engagement_strategy?: string | null
          id?: string
          influence?: string | null
          interest?: string | null
          name?: string
          org_id?: string
          project_id?: string
          role?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stakeholders_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stakeholders_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      status_updates: {
        Row: {
          achievements: string | null
          blockers: string | null
          cost_rag: Database["public"]["Enums"]["project_rag"] | null
          created_at: string
          id: string
          next_steps: string | null
          org_id: string
          overall_rag: Database["public"]["Enums"]["project_rag"] | null
          progress_summary: string | null
          project_id: string
          reporter: string | null
          schedule_rag: Database["public"]["Enums"]["project_rag"] | null
          scope_rag: Database["public"]["Enums"]["project_rag"] | null
          update_date: string | null
          updated_at: string
        }
        Insert: {
          achievements?: string | null
          blockers?: string | null
          cost_rag?: Database["public"]["Enums"]["project_rag"] | null
          created_at?: string
          id?: string
          next_steps?: string | null
          org_id: string
          overall_rag?: Database["public"]["Enums"]["project_rag"] | null
          progress_summary?: string | null
          project_id: string
          reporter?: string | null
          schedule_rag?: Database["public"]["Enums"]["project_rag"] | null
          scope_rag?: Database["public"]["Enums"]["project_rag"] | null
          update_date?: string | null
          updated_at?: string
        }
        Update: {
          achievements?: string | null
          blockers?: string | null
          cost_rag?: Database["public"]["Enums"]["project_rag"] | null
          created_at?: string
          id?: string
          next_steps?: string | null
          org_id?: string
          overall_rag?: Database["public"]["Enums"]["project_rag"] | null
          progress_summary?: string | null
          project_id?: string
          reporter?: string | null
          schedule_rag?: Database["public"]["Enums"]["project_rag"] | null
          scope_rag?: Database["public"]["Enums"]["project_rag"] | null
          update_date?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "status_updates_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "status_updates_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          cancel_at_period_end: boolean
          created_at: string
          current_period_end: string | null
          current_period_start: string | null
          id: string
          org_id: string
          plan_id: string | null
          status: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          updated_at: string
        }
        Insert: {
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          org_id: string
          plan_id?: string | null
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
        }
        Update: {
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          org_id?: string
          plan_id?: string | null
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "billing_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          bu_id: string | null
          created_at: string
          id: string
          org_id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          bu_id?: string | null
          created_at?: string
          id?: string
          org_id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          bu_id?: string | null
          created_at?: string
          id?: string
          org_id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_bu_id_fkey"
            columns: ["bu_id"]
            isOneToOne: false
            referencedRelation: "business_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_roles_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_edit_project: {
        Args: { _project_id: string; _user_id: string }
        Returns: boolean
      }
      enable_project_streams: {
        Args: { p_project_id: string }
        Returns: string
      }
      ensure_project_core_stream: {
        Args: { p_project_id: string }
        Returns: string
      }
      rollup_project_from_streams: {
        Args: { p_project_id: string }
        Returns: undefined
      }
      create_org_and_join: {
        Args: { _name: string; _slug: string }
        Returns: string
      }
      generate_due_invoices: {
        Args: never
        Returns: {
          amount_cents: number
          invoice_id: string
          org_id: string
        }[]
      }
      get_org_limits: {
        Args: { _org_id: string }
        Returns: {
          max_projects: number
          max_users: number
          plan_code: string
          plan_name: string
        }[]
      }
      get_user_org: { Args: { _user_id: string }; Returns: string }
      has_any_admin: { Args: { _user_id: string }; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_platform_admin: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      app_role:
        | "admin"
        | "org_admin"
        | "bu_lead"
        | "pm"
        | "executive"
        | "platform_admin"
      delivery_method: "Waterfall" | "Agile" | "Hybrid"
      project_rag: "Green" | "Amber" | "Red"
      project_status:
        | "Not Started"
        | "In Progress"
        | "On Hold"
        | "Completed"
        | "Cancelled"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: [
        "admin",
        "org_admin",
        "bu_lead",
        "pm",
        "executive",
        "platform_admin",
      ],
      delivery_method: ["Waterfall", "Agile", "Hybrid"],
      project_rag: ["Green", "Amber", "Red"],
      project_status: [
        "Not Started",
        "In Progress",
        "On Hold",
        "Completed",
        "Cancelled",
      ],
    },
  },
} as const

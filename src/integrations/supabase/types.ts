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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      assessment_responses: {
        Row: {
          answers: Json
          assessment_id: string
          created_at: string
          factor_scores: Json
          flags: Json | null
          id: string
          metadata: Json | null
        }
        Insert: {
          answers: Json
          assessment_id: string
          created_at?: string
          factor_scores: Json
          flags?: Json | null
          id?: string
          metadata?: Json | null
        }
        Update: {
          answers?: Json
          assessment_id?: string
          created_at?: string
          factor_scores?: Json
          flags?: Json | null
          id?: string
          metadata?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "assessment_responses_assessment_id_fkey"
            columns: ["assessment_id"]
            isOneToOne: true
            referencedRelation: "assessments"
            referencedColumns: ["id"]
          },
        ]
      }
      assessment_templates: {
        Row: {
          center_id: string
          chart_full_mark: number
          code: string
          created_at: string
          description: string | null
          flag_threshold: number
          id: string
          instructions: string | null
          interpretations: Json | null
          is_active: boolean
          items: Json
          max_label: string | null
          min_label: string | null
          name: string
          response_max: number
          response_min: number
          scoring: Json
          updated_at: string
          version: number
        }
        Insert: {
          center_id: string
          chart_full_mark?: number
          code: string
          created_at?: string
          description?: string | null
          flag_threshold?: number
          id?: string
          instructions?: string | null
          interpretations?: Json | null
          is_active?: boolean
          items: Json
          max_label?: string | null
          min_label?: string | null
          name: string
          response_max?: number
          response_min?: number
          scoring: Json
          updated_at?: string
          version?: number
        }
        Update: {
          center_id?: string
          chart_full_mark?: number
          code?: string
          created_at?: string
          description?: string | null
          flag_threshold?: number
          id?: string
          instructions?: string | null
          interpretations?: Json | null
          is_active?: boolean
          items?: Json
          max_label?: string | null
          min_label?: string | null
          name?: string
          response_max?: number
          response_min?: number
          scoring?: Json
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "assessment_templates_center_id_fkey"
            columns: ["center_id"]
            isOneToOne: false
            referencedRelation: "centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessment_templates_center_id_fkey"
            columns: ["center_id"]
            isOneToOne: false
            referencedRelation: "portal_centers"
            referencedColumns: ["id"]
          },
        ]
      }
      assessments: {
        Row: {
          access_token: string
          center_id: string
          completed_at: string | null
          created_at: string
          expires_at: string
          id: string
          patient_id: string
          professional_id: string
          sent_at: string | null
          sent_to: string | null
          sent_via: string | null
          status: Database["public"]["Enums"]["assessment_status"]
          template_id: string
          updated_at: string
        }
        Insert: {
          access_token?: string
          center_id: string
          completed_at?: string | null
          created_at?: string
          expires_at: string
          id?: string
          patient_id: string
          professional_id: string
          sent_at?: string | null
          sent_to?: string | null
          sent_via?: string | null
          status?: Database["public"]["Enums"]["assessment_status"]
          template_id: string
          updated_at?: string
        }
        Update: {
          access_token?: string
          center_id?: string
          completed_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          patient_id?: string
          professional_id?: string
          sent_at?: string | null
          sent_to?: string | null
          sent_via?: string | null
          status?: Database["public"]["Enums"]["assessment_status"]
          template_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "assessments_center_id_fkey"
            columns: ["center_id"]
            isOneToOne: false
            referencedRelation: "centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessments_center_id_fkey"
            columns: ["center_id"]
            isOneToOne: false
            referencedRelation: "portal_centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessments_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessments_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessments_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "assessment_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          created_at: string
          id: string
          ip_address: string | null
          new_values: Json | null
          old_values: Json | null
          record_id: string | null
          table_name: string
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          ip_address?: string | null
          new_values?: Json | null
          old_values?: Json | null
          record_id?: string | null
          table_name: string
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          ip_address?: string | null
          new_values?: Json | null
          old_values?: Json | null
          record_id?: string | null
          table_name?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      availability: {
        Row: {
          created_at: string
          day_of_week: number
          end_time: string
          id: string
          is_available: boolean | null
          professional_id: string
          start_time: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          day_of_week: number
          end_time: string
          id?: string
          is_available?: boolean | null
          professional_id: string
          start_time: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          day_of_week?: number
          end_time?: string
          id?: string
          is_available?: boolean | null
          professional_id?: string
          start_time?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "availability_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      billable_events: {
        Row: {
          amount: number
          billing_status: string
          center_id: string
          concept: string
          created_at: string
          id: string
          patient_id: string
          session_id: string | null
          updated_at: string
        }
        Insert: {
          amount?: number
          billing_status?: string
          center_id: string
          concept: string
          created_at?: string
          id?: string
          patient_id: string
          session_id?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          billing_status?: string
          center_id?: string
          concept?: string
          created_at?: string
          id?: string
          patient_id?: string
          session_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "billable_events_center_id_fkey"
            columns: ["center_id"]
            isOneToOne: false
            referencedRelation: "centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billable_events_center_id_fkey"
            columns: ["center_id"]
            isOneToOne: false
            referencedRelation: "portal_centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billable_events_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billable_events_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      bono_items: {
        Row: {
          bono_id: string
          created_at: string
          id: string
          session_id: string | null
          used_at: string
        }
        Insert: {
          bono_id: string
          created_at?: string
          id?: string
          session_id?: string | null
          used_at?: string
        }
        Update: {
          bono_id?: string
          created_at?: string
          id?: string
          session_id?: string | null
          used_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bono_items_bono_id_fkey"
            columns: ["bono_id"]
            isOneToOne: false
            referencedRelation: "bonos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bono_items_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      bono_templates: {
        Row: {
          center_id: string
          created_at: string | null
          id: string
          is_active: boolean | null
          name: string
          price_per_session: number
          total_price: number
          total_sessions: number
          updated_at: string | null
          validity_days: number | null
        }
        Insert: {
          center_id: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          price_per_session: number
          total_price: number
          total_sessions: number
          updated_at?: string | null
          validity_days?: number | null
        }
        Update: {
          center_id?: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          price_per_session?: number
          total_price?: number
          total_sessions?: number
          updated_at?: string | null
          validity_days?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "bono_templates_center_id_fkey"
            columns: ["center_id"]
            isOneToOne: false
            referencedRelation: "centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bono_templates_center_id_fkey"
            columns: ["center_id"]
            isOneToOne: false
            referencedRelation: "portal_centers"
            referencedColumns: ["id"]
          },
        ]
      }
      bonos: {
        Row: {
          center_id: string
          created_at: string
          expires_at: string | null
          id: string
          name: string
          patient_id: string
          price_per_session: number
          status: Database["public"]["Enums"]["bono_status"] | null
          total_price: number
          total_sessions: number
          updated_at: string
          used_sessions: number | null
        }
        Insert: {
          center_id: string
          created_at?: string
          expires_at?: string | null
          id?: string
          name: string
          patient_id: string
          price_per_session: number
          status?: Database["public"]["Enums"]["bono_status"] | null
          total_price: number
          total_sessions: number
          updated_at?: string
          used_sessions?: number | null
        }
        Update: {
          center_id?: string
          created_at?: string
          expires_at?: string | null
          id?: string
          name?: string
          patient_id?: string
          price_per_session?: number
          status?: Database["public"]["Enums"]["bono_status"] | null
          total_price?: number
          total_sessions?: number
          updated_at?: string
          used_sessions?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "bonos_center_id_fkey"
            columns: ["center_id"]
            isOneToOne: false
            referencedRelation: "centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bonos_center_id_fkey"
            columns: ["center_id"]
            isOneToOne: false
            referencedRelation: "portal_centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bonos_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_events: {
        Row: {
          all_day: boolean | null
          calendar_id: string
          converted_at: string | null
          converted_session_id: string | null
          created_at: string | null
          deleted: boolean | null
          description: string | null
          end_at: string | null
          etag: string | null
          google_event_id: string
          id: string
          is_converted: boolean | null
          location: string | null
          professional_id: string
          provider: string
          raw: Json | null
          start_at: string | null
          status: string | null
          summary: string | null
          updated_at: string | null
          updated_at_google: string | null
        }
        Insert: {
          all_day?: boolean | null
          calendar_id: string
          converted_at?: string | null
          converted_session_id?: string | null
          created_at?: string | null
          deleted?: boolean | null
          description?: string | null
          end_at?: string | null
          etag?: string | null
          google_event_id: string
          id?: string
          is_converted?: boolean | null
          location?: string | null
          professional_id: string
          provider: string
          raw?: Json | null
          start_at?: string | null
          status?: string | null
          summary?: string | null
          updated_at?: string | null
          updated_at_google?: string | null
        }
        Update: {
          all_day?: boolean | null
          calendar_id?: string
          converted_at?: string | null
          converted_session_id?: string | null
          created_at?: string | null
          deleted?: boolean | null
          description?: string | null
          end_at?: string | null
          etag?: string | null
          google_event_id?: string
          id?: string
          is_converted?: boolean | null
          location?: string | null
          professional_id?: string
          provider?: string
          raw?: Json | null
          start_at?: string | null
          status?: string | null
          summary?: string | null
          updated_at?: string | null
          updated_at_google?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "calendar_events_converted_session_id_fkey"
            columns: ["converted_session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_events_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      center_locations: {
        Row: {
          center_id: string
          city: string | null
          country: string | null
          created_at: string | null
          id: string
          is_active: boolean | null
          is_public: boolean | null
          location_type:
            | Database["public"]["Enums"]["location_type_enum"]
            | null
          name: string
          number_details: string | null
          postal_code: string | null
          street: string | null
          updated_at: string | null
        }
        Insert: {
          center_id: string
          city?: string | null
          country?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          is_public?: boolean | null
          location_type?:
            | Database["public"]["Enums"]["location_type_enum"]
            | null
          name: string
          number_details?: string | null
          postal_code?: string | null
          street?: string | null
          updated_at?: string | null
        }
        Update: {
          center_id?: string
          city?: string | null
          country?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          is_public?: boolean | null
          location_type?:
            | Database["public"]["Enums"]["location_type_enum"]
            | null
          name?: string
          number_details?: string | null
          postal_code?: string | null
          street?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "center_locations_center_id_fkey"
            columns: ["center_id"]
            isOneToOne: false
            referencedRelation: "centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "center_locations_center_id_fkey"
            columns: ["center_id"]
            isOneToOne: false
            referencedRelation: "portal_centers"
            referencedColumns: ["id"]
          },
        ]
      }
      centers: {
        Row: {
          address: string | null
          address_details: string | null
          admin_alerts_emails: string | null
          admin_alerts_enabled: boolean | null
          admin_alerts_events: Json | null
          admin_alerts_include_professional: boolean | null
          agenda_show_weekends: boolean | null
          auto_invoicing_enabled: boolean | null
          bizum_phone: string | null
          city: string | null
          consent_expiration_days: number | null
          country: string | null
          created_at: string
          custom_domain: string | null
          default_payment_mode: string | null
          default_scheduled_hours_before: number | null
          default_tax_name: string | null
          default_tax_rate: number | null
          email: string | null
          id: string
          include_tax_in_price: boolean | null
          invoice_footer: string | null
          invoice_logo_url: string | null
          invoice_next_number: number | null
          invoice_on_payment_mode: string | null
          invoice_prefix: string | null
          invoice_send_channel: string | null
          logo_url: string | null
          name: string
          oauth_google_client_id: string | null
          oauth_google_credentials: string | null
          oauth_stripe_credentials: string | null
          oauth_stripe_publishable_key: string | null
          oauth_zoom_client_id: string | null
          oauth_zoom_credentials: string | null
          payment_reminder_enabled: boolean | null
          payment_reminder_hours_after: number | null
          payment_reminder_interval_hours: number | null
          payment_reminder_max_count: number | null
          phone: string | null
          portal_allow_professional_selection: boolean | null
          portal_default_professional_id: string | null
          portal_enabled: boolean | null
          portal_require_approval: boolean | null
          portal_slug: string | null
          postal_code: string | null
          province: string | null
          public_booking_enabled: boolean | null
          reschedule_max_days: number | null
          reschedule_require_confirmation: boolean | null
          reschedule_slot_duration: number | null
          retention_name: string | null
          retention_rate: number | null
          session_reminder_channels: Json | null
          session_reminder_enabled: boolean | null
          session_reminder_hours_before: number | null
          session_reminder_timing: string | null
          tax_id: string | null
          updated_at: string
          verifactu_auto_enabled: boolean | null
          verifactu_certificate_base64: string | null
          verifactu_certificate_password: string | null
          verifactu_environment: string | null
          verifactu_numero_instalacion: number | null
          verifactu_sistema_informatico: string | null
          verifactu_software_name: string | null
          verifactu_software_nif: string | null
          verifactu_software_version: string | null
          whatsapp_access_token: string | null
          whatsapp_business_account_id: string | null
          whatsapp_phone_number_id: string | null
          whatsapp_send_method: string | null
        }
        Insert: {
          address?: string | null
          address_details?: string | null
          admin_alerts_emails?: string | null
          admin_alerts_enabled?: boolean | null
          admin_alerts_events?: Json | null
          admin_alerts_include_professional?: boolean | null
          agenda_show_weekends?: boolean | null
          auto_invoicing_enabled?: boolean | null
          bizum_phone?: string | null
          city?: string | null
          consent_expiration_days?: number | null
          country?: string | null
          created_at?: string
          custom_domain?: string | null
          default_payment_mode?: string | null
          default_scheduled_hours_before?: number | null
          default_tax_name?: string | null
          default_tax_rate?: number | null
          email?: string | null
          id?: string
          include_tax_in_price?: boolean | null
          invoice_footer?: string | null
          invoice_logo_url?: string | null
          invoice_next_number?: number | null
          invoice_on_payment_mode?: string | null
          invoice_prefix?: string | null
          invoice_send_channel?: string | null
          logo_url?: string | null
          name: string
          oauth_google_client_id?: string | null
          oauth_google_credentials?: string | null
          oauth_stripe_credentials?: string | null
          oauth_stripe_publishable_key?: string | null
          oauth_zoom_client_id?: string | null
          oauth_zoom_credentials?: string | null
          payment_reminder_enabled?: boolean | null
          payment_reminder_hours_after?: number | null
          payment_reminder_interval_hours?: number | null
          payment_reminder_max_count?: number | null
          phone?: string | null
          portal_allow_professional_selection?: boolean | null
          portal_default_professional_id?: string | null
          portal_enabled?: boolean | null
          portal_require_approval?: boolean | null
          portal_slug?: string | null
          postal_code?: string | null
          province?: string | null
          public_booking_enabled?: boolean | null
          reschedule_max_days?: number | null
          reschedule_require_confirmation?: boolean | null
          reschedule_slot_duration?: number | null
          retention_name?: string | null
          retention_rate?: number | null
          session_reminder_channels?: Json | null
          session_reminder_enabled?: boolean | null
          session_reminder_hours_before?: number | null
          session_reminder_timing?: string | null
          tax_id?: string | null
          updated_at?: string
          verifactu_auto_enabled?: boolean | null
          verifactu_certificate_base64?: string | null
          verifactu_certificate_password?: string | null
          verifactu_environment?: string | null
          verifactu_numero_instalacion?: number | null
          verifactu_sistema_informatico?: string | null
          verifactu_software_name?: string | null
          verifactu_software_nif?: string | null
          verifactu_software_version?: string | null
          whatsapp_access_token?: string | null
          whatsapp_business_account_id?: string | null
          whatsapp_phone_number_id?: string | null
          whatsapp_send_method?: string | null
        }
        Update: {
          address?: string | null
          address_details?: string | null
          admin_alerts_emails?: string | null
          admin_alerts_enabled?: boolean | null
          admin_alerts_events?: Json | null
          admin_alerts_include_professional?: boolean | null
          agenda_show_weekends?: boolean | null
          auto_invoicing_enabled?: boolean | null
          bizum_phone?: string | null
          city?: string | null
          consent_expiration_days?: number | null
          country?: string | null
          created_at?: string
          custom_domain?: string | null
          default_payment_mode?: string | null
          default_scheduled_hours_before?: number | null
          default_tax_name?: string | null
          default_tax_rate?: number | null
          email?: string | null
          id?: string
          include_tax_in_price?: boolean | null
          invoice_footer?: string | null
          invoice_logo_url?: string | null
          invoice_next_number?: number | null
          invoice_on_payment_mode?: string | null
          invoice_prefix?: string | null
          invoice_send_channel?: string | null
          logo_url?: string | null
          name?: string
          oauth_google_client_id?: string | null
          oauth_google_credentials?: string | null
          oauth_stripe_credentials?: string | null
          oauth_stripe_publishable_key?: string | null
          oauth_zoom_client_id?: string | null
          oauth_zoom_credentials?: string | null
          payment_reminder_enabled?: boolean | null
          payment_reminder_hours_after?: number | null
          payment_reminder_interval_hours?: number | null
          payment_reminder_max_count?: number | null
          phone?: string | null
          portal_allow_professional_selection?: boolean | null
          portal_default_professional_id?: string | null
          portal_enabled?: boolean | null
          portal_require_approval?: boolean | null
          portal_slug?: string | null
          postal_code?: string | null
          province?: string | null
          public_booking_enabled?: boolean | null
          reschedule_max_days?: number | null
          reschedule_require_confirmation?: boolean | null
          reschedule_slot_duration?: number | null
          retention_name?: string | null
          retention_rate?: number | null
          session_reminder_channels?: Json | null
          session_reminder_enabled?: boolean | null
          session_reminder_hours_before?: number | null
          session_reminder_timing?: string | null
          tax_id?: string | null
          updated_at?: string
          verifactu_auto_enabled?: boolean | null
          verifactu_certificate_base64?: string | null
          verifactu_certificate_password?: string | null
          verifactu_environment?: string | null
          verifactu_numero_instalacion?: number | null
          verifactu_sistema_informatico?: string | null
          verifactu_software_name?: string | null
          verifactu_software_nif?: string | null
          verifactu_software_version?: string | null
          whatsapp_access_token?: string | null
          whatsapp_business_account_id?: string | null
          whatsapp_phone_number_id?: string | null
          whatsapp_send_method?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "centers_portal_default_professional_id_fkey"
            columns: ["portal_default_professional_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      communication_templates: {
        Row: {
          center_id: string
          channel: string
          created_at: string | null
          email_confirmation_text: string | null
          email_footer: string | null
          email_initial_text: string | null
          email_payment_text: string | null
          email_subject: string | null
          email_videocall_text: string | null
          id: string
          is_active: boolean | null
          sms_message: string | null
          template_type: string
          updated_at: string | null
          whatsapp_message: string | null
        }
        Insert: {
          center_id: string
          channel: string
          created_at?: string | null
          email_confirmation_text?: string | null
          email_footer?: string | null
          email_initial_text?: string | null
          email_payment_text?: string | null
          email_subject?: string | null
          email_videocall_text?: string | null
          id?: string
          is_active?: boolean | null
          sms_message?: string | null
          template_type: string
          updated_at?: string | null
          whatsapp_message?: string | null
        }
        Update: {
          center_id?: string
          channel?: string
          created_at?: string | null
          email_confirmation_text?: string | null
          email_footer?: string | null
          email_initial_text?: string | null
          email_payment_text?: string | null
          email_subject?: string | null
          email_videocall_text?: string | null
          id?: string
          is_active?: boolean | null
          sms_message?: string | null
          template_type?: string
          updated_at?: string | null
          whatsapp_message?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "communication_templates_center_id_fkey"
            columns: ["center_id"]
            isOneToOne: false
            referencedRelation: "centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communication_templates_center_id_fkey"
            columns: ["center_id"]
            isOneToOne: false
            referencedRelation: "portal_centers"
            referencedColumns: ["id"]
          },
        ]
      }
      consent_signatures: {
        Row: {
          consent_id: string
          id: string
          ip_address: string | null
          signature_data: string
          signature_order: number
          signed_at: string | null
          signer_name: string
          signer_role: string
          user_agent: string | null
        }
        Insert: {
          consent_id: string
          id?: string
          ip_address?: string | null
          signature_data: string
          signature_order: number
          signed_at?: string | null
          signer_name: string
          signer_role: string
          user_agent?: string | null
        }
        Update: {
          consent_id?: string
          id?: string
          ip_address?: string | null
          signature_data?: string
          signature_order?: number
          signed_at?: string | null
          signer_name?: string
          signer_role?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "consent_signatures_consent_id_fkey"
            columns: ["consent_id"]
            isOneToOne: false
            referencedRelation: "consents"
            referencedColumns: ["id"]
          },
        ]
      }
      consent_templates: {
        Row: {
          center_id: string
          content_html: string
          created_at: string | null
          id: string
          is_active: boolean | null
          name: string
          requires_guardian_signature: boolean | null
          updated_at: string | null
          verification_checkboxes: Json | null
        }
        Insert: {
          center_id: string
          content_html: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          requires_guardian_signature?: boolean | null
          updated_at?: string | null
          verification_checkboxes?: Json | null
        }
        Update: {
          center_id?: string
          content_html?: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          requires_guardian_signature?: boolean | null
          updated_at?: string | null
          verification_checkboxes?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "consent_templates_center_id_fkey"
            columns: ["center_id"]
            isOneToOne: false
            referencedRelation: "centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consent_templates_center_id_fkey"
            columns: ["center_id"]
            isOneToOne: false
            referencedRelation: "portal_centers"
            referencedColumns: ["id"]
          },
        ]
      }
      consents: {
        Row: {
          access_token: string
          center_id: string
          content_snapshot: string
          created_at: string | null
          expires_at: string
          id: string
          patient_id: string
          professional_id: string
          requires_guardian: boolean | null
          revocation_reason: string | null
          revoked_at: string | null
          signed_at: string | null
          signed_pdf_url: string | null
          status: Database["public"]["Enums"]["consent_status"] | null
          template_id: string
          updated_at: string | null
        }
        Insert: {
          access_token?: string
          center_id: string
          content_snapshot: string
          created_at?: string | null
          expires_at: string
          id?: string
          patient_id: string
          professional_id: string
          requires_guardian?: boolean | null
          revocation_reason?: string | null
          revoked_at?: string | null
          signed_at?: string | null
          signed_pdf_url?: string | null
          status?: Database["public"]["Enums"]["consent_status"] | null
          template_id: string
          updated_at?: string | null
        }
        Update: {
          access_token?: string
          center_id?: string
          content_snapshot?: string
          created_at?: string | null
          expires_at?: string
          id?: string
          patient_id?: string
          professional_id?: string
          requires_guardian?: boolean | null
          revocation_reason?: string | null
          revoked_at?: string | null
          signed_at?: string | null
          signed_pdf_url?: string | null
          status?: Database["public"]["Enums"]["consent_status"] | null
          template_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "consents_center_id_fkey"
            columns: ["center_id"]
            isOneToOne: false
            referencedRelation: "centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consents_center_id_fkey"
            columns: ["center_id"]
            isOneToOne: false
            referencedRelation: "portal_centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consents_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consents_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consents_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "consent_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      debts: {
        Row: {
          access_token: string | null
          amount: number
          bono_id: string | null
          center_id: string
          created_at: string
          due_date: string | null
          id: string
          invoice_id: string | null
          notes: string | null
          paid_amount: number | null
          patient_id: string
          session_id: string | null
          status: Database["public"]["Enums"]["payment_status"] | null
          stripe_checkout_session_id: string | null
          stripe_payment_status: string | null
          updated_at: string
        }
        Insert: {
          access_token?: string | null
          amount: number
          bono_id?: string | null
          center_id: string
          created_at?: string
          due_date?: string | null
          id?: string
          invoice_id?: string | null
          notes?: string | null
          paid_amount?: number | null
          patient_id: string
          session_id?: string | null
          status?: Database["public"]["Enums"]["payment_status"] | null
          stripe_checkout_session_id?: string | null
          stripe_payment_status?: string | null
          updated_at?: string
        }
        Update: {
          access_token?: string | null
          amount?: number
          bono_id?: string | null
          center_id?: string
          created_at?: string
          due_date?: string | null
          id?: string
          invoice_id?: string | null
          notes?: string | null
          paid_amount?: number | null
          patient_id?: string
          session_id?: string | null
          status?: Database["public"]["Enums"]["payment_status"] | null
          stripe_checkout_session_id?: string | null
          stripe_payment_status?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "debts_bono_id_fkey"
            columns: ["bono_id"]
            isOneToOne: false
            referencedRelation: "bonos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "debts_center_id_fkey"
            columns: ["center_id"]
            isOneToOne: false
            referencedRelation: "centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "debts_center_id_fkey"
            columns: ["center_id"]
            isOneToOne: false
            referencedRelation: "portal_centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "debts_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "debts_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "debts_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      google_calendar_channels: {
        Row: {
          calendar_id: string
          channel_id: string
          created_at: string | null
          expiration: string
          id: string
          professional_id: string
          resource_id: string
        }
        Insert: {
          calendar_id: string
          channel_id: string
          created_at?: string | null
          expiration: string
          id?: string
          professional_id: string
          resource_id: string
        }
        Update: {
          calendar_id?: string
          channel_id?: string
          created_at?: string | null
          expiration?: string
          id?: string
          professional_id?: string
          resource_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "google_calendar_channels_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_items: {
        Row: {
          billable_event_id: string | null
          bono_id: string | null
          created_at: string
          description: string
          id: string
          invoice_id: string
          quantity: number | null
          retention_amount: number | null
          retention_name: string | null
          retention_rate: number | null
          session_id: string | null
          tax_amount: number | null
          tax_name: string | null
          tax_rate: number | null
          total: number
          unit_price: number
        }
        Insert: {
          billable_event_id?: string | null
          bono_id?: string | null
          created_at?: string
          description: string
          id?: string
          invoice_id: string
          quantity?: number | null
          retention_amount?: number | null
          retention_name?: string | null
          retention_rate?: number | null
          session_id?: string | null
          tax_amount?: number | null
          tax_name?: string | null
          tax_rate?: number | null
          total: number
          unit_price: number
        }
        Update: {
          billable_event_id?: string | null
          bono_id?: string | null
          created_at?: string
          description?: string
          id?: string
          invoice_id?: string
          quantity?: number | null
          retention_amount?: number | null
          retention_name?: string | null
          retention_rate?: number | null
          session_id?: string | null
          tax_amount?: number | null
          tax_name?: string | null
          tax_rate?: number | null
          total?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoice_items_billable_event_id_fkey"
            columns: ["billable_event_id"]
            isOneToOne: false
            referencedRelation: "billable_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_items_bono_id_fkey"
            columns: ["bono_id"]
            isOneToOne: false
            referencedRelation: "bonos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_items_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_series: {
        Row: {
          center_id: string
          created_at: string
          format: string
          id: string
          invoice_type: string
          is_archived: boolean | null
          is_default: boolean | null
          name: string
          next_number: number
          series_type: string
          updated_at: string
        }
        Insert: {
          center_id: string
          created_at?: string
          format?: string
          id?: string
          invoice_type?: string
          is_archived?: boolean | null
          is_default?: boolean | null
          name: string
          next_number?: number
          series_type?: string
          updated_at?: string
        }
        Update: {
          center_id?: string
          created_at?: string
          format?: string
          id?: string
          invoice_type?: string
          is_archived?: boolean | null
          is_default?: boolean | null
          name?: string
          next_number?: number
          series_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_series_center_id_fkey"
            columns: ["center_id"]
            isOneToOne: false
            referencedRelation: "centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_series_center_id_fkey"
            columns: ["center_id"]
            isOneToOne: false
            referencedRelation: "portal_centers"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          access_token: string | null
          base_rectificada: number | null
          center_id: string
          created_at: string
          cuota_recargo_rectificado: number | null
          cuota_rectificada: number | null
          due_date: string | null
          id: string
          invoice_hash: string | null
          invoice_number: string
          is_recapitulative: boolean | null
          is_valid: boolean
          issue_date: string
          notes: string | null
          patient_id: string
          previous_invoice_hash: string | null
          rectification_reason_code: string | null
          rectification_type: string | null
          rectified_invoice_id: string | null
          retention_amount: number | null
          retention_rate: number | null
          series_id: string | null
          status: Database["public"]["Enums"]["invoice_status"] | null
          subtotal: number
          tax_amount: number | null
          tax_rate: number | null
          total: number
          updated_at: string
          verifactu_hash: string | null
          verifactu_pending: boolean | null
          verifactu_qr: string | null
          verifactu_registration_id: string | null
          verifactu_retry_count: number | null
          verifactu_timestamp: string | null
        }
        Insert: {
          access_token?: string | null
          base_rectificada?: number | null
          center_id: string
          created_at?: string
          cuota_recargo_rectificado?: number | null
          cuota_rectificada?: number | null
          due_date?: string | null
          id?: string
          invoice_hash?: string | null
          invoice_number: string
          is_recapitulative?: boolean | null
          is_valid?: boolean
          issue_date?: string
          notes?: string | null
          patient_id: string
          previous_invoice_hash?: string | null
          rectification_reason_code?: string | null
          rectification_type?: string | null
          rectified_invoice_id?: string | null
          retention_amount?: number | null
          retention_rate?: number | null
          series_id?: string | null
          status?: Database["public"]["Enums"]["invoice_status"] | null
          subtotal?: number
          tax_amount?: number | null
          tax_rate?: number | null
          total?: number
          updated_at?: string
          verifactu_hash?: string | null
          verifactu_pending?: boolean | null
          verifactu_qr?: string | null
          verifactu_registration_id?: string | null
          verifactu_retry_count?: number | null
          verifactu_timestamp?: string | null
        }
        Update: {
          access_token?: string | null
          base_rectificada?: number | null
          center_id?: string
          created_at?: string
          cuota_recargo_rectificado?: number | null
          cuota_rectificada?: number | null
          due_date?: string | null
          id?: string
          invoice_hash?: string | null
          invoice_number?: string
          is_recapitulative?: boolean | null
          is_valid?: boolean
          issue_date?: string
          notes?: string | null
          patient_id?: string
          previous_invoice_hash?: string | null
          rectification_reason_code?: string | null
          rectification_type?: string | null
          rectified_invoice_id?: string | null
          retention_amount?: number | null
          retention_rate?: number | null
          series_id?: string | null
          status?: Database["public"]["Enums"]["invoice_status"] | null
          subtotal?: number
          tax_amount?: number | null
          tax_rate?: number | null
          total?: number
          updated_at?: string
          verifactu_hash?: string | null
          verifactu_pending?: boolean | null
          verifactu_qr?: string | null
          verifactu_registration_id?: string | null
          verifactu_retry_count?: number | null
          verifactu_timestamp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_center_id_fkey"
            columns: ["center_id"]
            isOneToOne: false
            referencedRelation: "centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_center_id_fkey"
            columns: ["center_id"]
            isOneToOne: false
            referencedRelation: "portal_centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_rectified_invoice_id_fkey"
            columns: ["rectified_invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_series_id_fkey"
            columns: ["series_id"]
            isOneToOne: false
            referencedRelation: "invoice_series"
            referencedColumns: ["id"]
          },
        ]
      }
      location_schedules: {
        Row: {
          created_at: string | null
          day_of_week: number
          end_time: string
          id: string
          is_open: boolean | null
          location_id: string
          start_time: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          day_of_week: number
          end_time?: string
          id?: string
          is_open?: boolean | null
          location_id: string
          start_time?: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          day_of_week?: number
          end_time?: string
          id?: string
          is_open?: boolean | null
          location_id?: string
          start_time?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "location_schedules_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "center_locations"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          center_id: string
          created_at: string
          error_message: string | null
          id: string
          message: string
          patient_id: string | null
          recipient: string
          scheduled_for: string | null
          sent_at: string | null
          session_id: string | null
          status: Database["public"]["Enums"]["notification_status"] | null
          subject: string | null
          type: Database["public"]["Enums"]["notification_type"]
        }
        Insert: {
          center_id: string
          created_at?: string
          error_message?: string | null
          id?: string
          message: string
          patient_id?: string | null
          recipient: string
          scheduled_for?: string | null
          sent_at?: string | null
          session_id?: string | null
          status?: Database["public"]["Enums"]["notification_status"] | null
          subject?: string | null
          type: Database["public"]["Enums"]["notification_type"]
        }
        Update: {
          center_id?: string
          created_at?: string
          error_message?: string | null
          id?: string
          message?: string
          patient_id?: string | null
          recipient?: string
          scheduled_for?: string | null
          sent_at?: string | null
          session_id?: string | null
          status?: Database["public"]["Enums"]["notification_status"] | null
          subject?: string | null
          type?: Database["public"]["Enums"]["notification_type"]
        }
        Relationships: [
          {
            foreignKeyName: "notifications_center_id_fkey"
            columns: ["center_id"]
            isOneToOne: false
            referencedRelation: "centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_center_id_fkey"
            columns: ["center_id"]
            isOneToOne: false
            referencedRelation: "portal_centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      oauth_connections: {
        Row: {
          access_token: string | null
          consecutive_sync_errors: number | null
          created_at: string | null
          expires_at: string | null
          google_calendar_id: string | null
          id: string
          last_sync_at: string | null
          last_sync_status: string | null
          needs_reconnect: boolean | null
          professional_id: string
          provider: string
          provider_account_id: string | null
          refresh_token: string | null
          scope: string | null
          stripe_account_id: string | null
          stripe_account_status: string | null
          sync_token: string | null
          updated_at: string | null
          watch_channel_id: string | null
          watch_channel_token: string | null
          watch_expires_at: string | null
          watch_resource_id: string | null
        }
        Insert: {
          access_token?: string | null
          consecutive_sync_errors?: number | null
          created_at?: string | null
          expires_at?: string | null
          google_calendar_id?: string | null
          id?: string
          last_sync_at?: string | null
          last_sync_status?: string | null
          needs_reconnect?: boolean | null
          professional_id: string
          provider: string
          provider_account_id?: string | null
          refresh_token?: string | null
          scope?: string | null
          stripe_account_id?: string | null
          stripe_account_status?: string | null
          sync_token?: string | null
          updated_at?: string | null
          watch_channel_id?: string | null
          watch_channel_token?: string | null
          watch_expires_at?: string | null
          watch_resource_id?: string | null
        }
        Update: {
          access_token?: string | null
          consecutive_sync_errors?: number | null
          created_at?: string | null
          expires_at?: string | null
          google_calendar_id?: string | null
          id?: string
          last_sync_at?: string | null
          last_sync_status?: string | null
          needs_reconnect?: boolean | null
          professional_id?: string
          provider?: string
          provider_account_id?: string | null
          refresh_token?: string | null
          scope?: string | null
          stripe_account_id?: string | null
          stripe_account_status?: string | null
          sync_token?: string | null
          updated_at?: string | null
          watch_channel_id?: string | null
          watch_channel_token?: string | null
          watch_expires_at?: string | null
          watch_resource_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "oauth_connections_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_magic_links: {
        Row: {
          center_id: string
          created_at: string | null
          email: string
          expires_at: string
          id: string
          patient_id: string | null
          token: string
          used_at: string | null
        }
        Insert: {
          center_id: string
          created_at?: string | null
          email: string
          expires_at: string
          id?: string
          patient_id?: string | null
          token: string
          used_at?: string | null
        }
        Update: {
          center_id?: string
          created_at?: string | null
          email?: string
          expires_at?: string
          id?: string
          patient_id?: string | null
          token?: string
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "patient_magic_links_center_id_fkey"
            columns: ["center_id"]
            isOneToOne: false
            referencedRelation: "centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_magic_links_center_id_fkey"
            columns: ["center_id"]
            isOneToOne: false
            referencedRelation: "portal_centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_magic_links_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_portal_accounts: {
        Row: {
          created_at: string
          email: string
          id: string
          is_active: boolean | null
          last_login_at: string | null
          patient_id: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          is_active?: boolean | null
          last_login_at?: string | null
          patient_id: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          is_active?: boolean | null
          last_login_at?: string | null
          patient_id?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "patient_portal_accounts_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: true
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      patients: {
        Row: {
          address: string | null
          assigned_professional_id: string | null
          center_id: string
          city: string | null
          created_at: string
          date_of_birth: string | null
          email: string | null
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          first_name: string
          gender: string | null
          guardian_email: string | null
          guardian_name: string | null
          guardian_phone: string | null
          guardian_relationship: string | null
          id: string
          is_minor: boolean | null
          last_name: string
          notes: string | null
          phone: string | null
          postal_code: string | null
          status: Database["public"]["Enums"]["patient_status"] | null
          tax_id: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          assigned_professional_id?: string | null
          center_id: string
          city?: string | null
          created_at?: string
          date_of_birth?: string | null
          email?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          first_name: string
          gender?: string | null
          guardian_email?: string | null
          guardian_name?: string | null
          guardian_phone?: string | null
          guardian_relationship?: string | null
          id?: string
          is_minor?: boolean | null
          last_name: string
          notes?: string | null
          phone?: string | null
          postal_code?: string | null
          status?: Database["public"]["Enums"]["patient_status"] | null
          tax_id?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          assigned_professional_id?: string | null
          center_id?: string
          city?: string | null
          created_at?: string
          date_of_birth?: string | null
          email?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          first_name?: string
          gender?: string | null
          guardian_email?: string | null
          guardian_name?: string | null
          guardian_phone?: string | null
          guardian_relationship?: string | null
          id?: string
          is_minor?: boolean | null
          last_name?: string
          notes?: string | null
          phone?: string | null
          postal_code?: string | null
          status?: Database["public"]["Enums"]["patient_status"] | null
          tax_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "patients_assigned_professional_id_fkey"
            columns: ["assigned_professional_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patients_center_id_fkey"
            columns: ["center_id"]
            isOneToOne: false
            referencedRelation: "centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patients_center_id_fkey"
            columns: ["center_id"]
            isOneToOne: false
            referencedRelation: "portal_centers"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          center_id: string
          created_at: string
          id: string
          invoice_id: string | null
          notes: string | null
          patient_id: string
          payment_date: string
          payment_method: string | null
          reference: string | null
          session_id: string | null
          updated_at: string
        }
        Insert: {
          amount: number
          center_id: string
          created_at?: string
          id?: string
          invoice_id?: string | null
          notes?: string | null
          patient_id: string
          payment_date?: string
          payment_method?: string | null
          reference?: string | null
          session_id?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          center_id?: string
          created_at?: string
          id?: string
          invoice_id?: string | null
          notes?: string | null
          patient_id?: string
          payment_date?: string
          payment_method?: string | null
          reference?: string | null
          session_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_center_id_fkey"
            columns: ["center_id"]
            isOneToOne: false
            referencedRelation: "centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_center_id_fkey"
            columns: ["center_id"]
            isOneToOne: false
            referencedRelation: "portal_centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      professional_integrations: {
        Row: {
          created_at: string | null
          default_video_provider: string | null
          google_calendar_enabled: boolean | null
          google_calendar_sync_mode: string | null
          google_event_description_format: string | null
          google_event_title_format: string | null
          google_meet_enabled: boolean | null
          google_sync_days_future: number | null
          google_sync_days_past: number | null
          id: string
          last_google_sync_at: string | null
          professional_id: string
          stripe_enabled: boolean | null
          stripe_payment_mode: string | null
          stripe_scheduled_hours_before: number | null
          updated_at: string | null
          whatsapp_access_token: string | null
          whatsapp_business_account_id: string | null
          whatsapp_enabled: boolean | null
          whatsapp_phone_number_id: string | null
          whatsapp_send_method: string | null
          zoom_enabled: boolean | null
        }
        Insert: {
          created_at?: string | null
          default_video_provider?: string | null
          google_calendar_enabled?: boolean | null
          google_calendar_sync_mode?: string | null
          google_event_description_format?: string | null
          google_event_title_format?: string | null
          google_meet_enabled?: boolean | null
          google_sync_days_future?: number | null
          google_sync_days_past?: number | null
          id?: string
          last_google_sync_at?: string | null
          professional_id: string
          stripe_enabled?: boolean | null
          stripe_payment_mode?: string | null
          stripe_scheduled_hours_before?: number | null
          updated_at?: string | null
          whatsapp_access_token?: string | null
          whatsapp_business_account_id?: string | null
          whatsapp_enabled?: boolean | null
          whatsapp_phone_number_id?: string | null
          whatsapp_send_method?: string | null
          zoom_enabled?: boolean | null
        }
        Update: {
          created_at?: string | null
          default_video_provider?: string | null
          google_calendar_enabled?: boolean | null
          google_calendar_sync_mode?: string | null
          google_event_description_format?: string | null
          google_event_title_format?: string | null
          google_meet_enabled?: boolean | null
          google_sync_days_future?: number | null
          google_sync_days_past?: number | null
          id?: string
          last_google_sync_at?: string | null
          professional_id?: string
          stripe_enabled?: boolean | null
          stripe_payment_mode?: string | null
          stripe_scheduled_hours_before?: number | null
          updated_at?: string | null
          whatsapp_access_token?: string | null
          whatsapp_business_account_id?: string | null
          whatsapp_enabled?: boolean | null
          whatsapp_phone_number_id?: string | null
          whatsapp_send_method?: string | null
          zoom_enabled?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "professional_integrations_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          center_id: string | null
          commission_rate: number | null
          created_at: string
          email: string
          first_name: string | null
          id: string
          is_active: boolean | null
          last_name: string | null
          license_number: string | null
          phone: string | null
          specialty: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          center_id?: string | null
          commission_rate?: number | null
          created_at?: string
          email: string
          first_name?: string | null
          id: string
          is_active?: boolean | null
          last_name?: string | null
          license_number?: string | null
          phone?: string | null
          specialty?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          center_id?: string | null
          commission_rate?: number | null
          created_at?: string
          email?: string
          first_name?: string | null
          id?: string
          is_active?: boolean | null
          last_name?: string | null
          license_number?: string | null
          phone?: string | null
          specialty?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_center_id_fkey"
            columns: ["center_id"]
            isOneToOne: false
            referencedRelation: "centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_center_id_fkey"
            columns: ["center_id"]
            isOneToOne: false
            referencedRelation: "portal_centers"
            referencedColumns: ["id"]
          },
        ]
      }
      recurring_series: {
        Row: {
          base_start_datetime: string
          bono_id: string | null
          cancellation_policy: string | null
          center_id: string
          created_at: string | null
          created_by: string
          duration_minutes: number
          id: string
          is_active: boolean | null
          last_generated_until: string | null
          location_id: string | null
          max_occurrences: number | null
          notes_default: string | null
          patient_id: string
          price: number
          professional_id: string
          rrule_json: Json
          session_modality: string | null
          session_type: string | null
          timezone: string
          updated_at: string | null
        }
        Insert: {
          base_start_datetime: string
          bono_id?: string | null
          cancellation_policy?: string | null
          center_id: string
          created_at?: string | null
          created_by: string
          duration_minutes?: number
          id?: string
          is_active?: boolean | null
          last_generated_until?: string | null
          location_id?: string | null
          max_occurrences?: number | null
          notes_default?: string | null
          patient_id: string
          price?: number
          professional_id: string
          rrule_json: Json
          session_modality?: string | null
          session_type?: string | null
          timezone?: string
          updated_at?: string | null
        }
        Update: {
          base_start_datetime?: string
          bono_id?: string | null
          cancellation_policy?: string | null
          center_id?: string
          created_at?: string | null
          created_by?: string
          duration_minutes?: number
          id?: string
          is_active?: boolean | null
          last_generated_until?: string | null
          location_id?: string | null
          max_occurrences?: number | null
          notes_default?: string | null
          patient_id?: string
          price?: number
          professional_id?: string
          rrule_json?: Json
          session_modality?: string | null
          session_type?: string | null
          timezone?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "recurring_series_bono_id_fkey"
            columns: ["bono_id"]
            isOneToOne: false
            referencedRelation: "bonos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_series_center_id_fkey"
            columns: ["center_id"]
            isOneToOne: false
            referencedRelation: "centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_series_center_id_fkey"
            columns: ["center_id"]
            isOneToOne: false
            referencedRelation: "portal_centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_series_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_series_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "center_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_series_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_series_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      session_types: {
        Row: {
          center_id: string
          color: string
          commission_rate: number | null
          created_at: string | null
          default_price: number
          display_order: number | null
          duration_minutes: number
          exemption_code: string | null
          id: string
          is_active: boolean | null
          is_public: boolean | null
          name: string
          non_subject_code: string | null
          tax_treatment: string | null
          updated_at: string | null
          vat_rate: number | null
          vat_regime_key: string | null
        }
        Insert: {
          center_id: string
          color?: string
          commission_rate?: number | null
          created_at?: string | null
          default_price?: number
          display_order?: number | null
          duration_minutes?: number
          exemption_code?: string | null
          id?: string
          is_active?: boolean | null
          is_public?: boolean | null
          name: string
          non_subject_code?: string | null
          tax_treatment?: string | null
          updated_at?: string | null
          vat_rate?: number | null
          vat_regime_key?: string | null
        }
        Update: {
          center_id?: string
          color?: string
          commission_rate?: number | null
          created_at?: string | null
          default_price?: number
          display_order?: number | null
          duration_minutes?: number
          exemption_code?: string | null
          id?: string
          is_active?: boolean | null
          is_public?: boolean | null
          name?: string
          non_subject_code?: string | null
          tax_treatment?: string | null
          updated_at?: string | null
          vat_rate?: number | null
          vat_regime_key?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "session_types_center_id_fkey"
            columns: ["center_id"]
            isOneToOne: false
            referencedRelation: "centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_types_center_id_fkey"
            columns: ["center_id"]
            isOneToOne: false
            referencedRelation: "portal_centers"
            referencedColumns: ["id"]
          },
        ]
      }
      sessions: {
        Row: {
          access_token: string | null
          bono_id: string | null
          cancellation_policy: string | null
          cancellation_reason: string | null
          center_id: string
          created_at: string
          end_time: string
          google_calendar_event_id: string | null
          id: string
          is_exception: boolean | null
          last_payment_reminder_at: string | null
          location_id: string | null
          notes: string | null
          occurrence_index: number | null
          original_start_datetime: string | null
          patient_id: string
          payment_mode: string | null
          payment_reminder_count: number | null
          payment_status: string | null
          price: number
          professional_id: string
          recurring_series_id: string | null
          reminder_sent_at: string | null
          room: string | null
          send_reminder_email: boolean | null
          send_reminder_sms: boolean | null
          send_reminder_whatsapp: boolean | null
          session_date: string
          session_modality: string | null
          session_type: string | null
          start_time: string
          status: Database["public"]["Enums"]["session_status"] | null
          stripe_checkout_session_id: string | null
          stripe_payment_mode: string | null
          stripe_payment_status: string | null
          updated_at: string
          video_call_link: string | null
          video_provider: string | null
        }
        Insert: {
          access_token?: string | null
          bono_id?: string | null
          cancellation_policy?: string | null
          cancellation_reason?: string | null
          center_id: string
          created_at?: string
          end_time: string
          google_calendar_event_id?: string | null
          id?: string
          is_exception?: boolean | null
          last_payment_reminder_at?: string | null
          location_id?: string | null
          notes?: string | null
          occurrence_index?: number | null
          original_start_datetime?: string | null
          patient_id: string
          payment_mode?: string | null
          payment_reminder_count?: number | null
          payment_status?: string | null
          price?: number
          professional_id: string
          recurring_series_id?: string | null
          reminder_sent_at?: string | null
          room?: string | null
          send_reminder_email?: boolean | null
          send_reminder_sms?: boolean | null
          send_reminder_whatsapp?: boolean | null
          session_date: string
          session_modality?: string | null
          session_type?: string | null
          start_time: string
          status?: Database["public"]["Enums"]["session_status"] | null
          stripe_checkout_session_id?: string | null
          stripe_payment_mode?: string | null
          stripe_payment_status?: string | null
          updated_at?: string
          video_call_link?: string | null
          video_provider?: string | null
        }
        Update: {
          access_token?: string | null
          bono_id?: string | null
          cancellation_policy?: string | null
          cancellation_reason?: string | null
          center_id?: string
          created_at?: string
          end_time?: string
          google_calendar_event_id?: string | null
          id?: string
          is_exception?: boolean | null
          last_payment_reminder_at?: string | null
          location_id?: string | null
          notes?: string | null
          occurrence_index?: number | null
          original_start_datetime?: string | null
          patient_id?: string
          payment_mode?: string | null
          payment_reminder_count?: number | null
          payment_status?: string | null
          price?: number
          professional_id?: string
          recurring_series_id?: string | null
          reminder_sent_at?: string | null
          room?: string | null
          send_reminder_email?: boolean | null
          send_reminder_sms?: boolean | null
          send_reminder_whatsapp?: boolean | null
          session_date?: string
          session_modality?: string | null
          session_type?: string | null
          start_time?: string
          status?: Database["public"]["Enums"]["session_status"] | null
          stripe_checkout_session_id?: string | null
          stripe_payment_mode?: string | null
          stripe_payment_status?: string | null
          updated_at?: string
          video_call_link?: string | null
          video_provider?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sessions_bono_id_fkey"
            columns: ["bono_id"]
            isOneToOne: false
            referencedRelation: "bonos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_center_id_fkey"
            columns: ["center_id"]
            isOneToOne: false
            referencedRelation: "centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_center_id_fkey"
            columns: ["center_id"]
            isOneToOne: false
            referencedRelation: "portal_centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "center_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_recurring_series_id_fkey"
            columns: ["recurring_series_id"]
            isOneToOne: false
            referencedRelation: "recurring_series"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          center_id: string
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          center_id: string
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          center_id?: string
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_center_id_fkey"
            columns: ["center_id"]
            isOneToOne: false
            referencedRelation: "centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_roles_center_id_fkey"
            columns: ["center_id"]
            isOneToOne: false
            referencedRelation: "portal_centers"
            referencedColumns: ["id"]
          },
        ]
      }
      verifactu_chain_status: {
        Row: {
          center_id: string
          created_at: string
          id: string
          id_sistema_informatico: string
          nif_emisor: string
          numero_instalacion: number
          ultima_factura_id: string | null
          ultimo_hash: string
          updated_at: string
        }
        Insert: {
          center_id: string
          created_at?: string
          id?: string
          id_sistema_informatico: string
          nif_emisor: string
          numero_instalacion: number
          ultima_factura_id?: string | null
          ultimo_hash: string
          updated_at?: string
        }
        Update: {
          center_id?: string
          created_at?: string
          id?: string
          id_sistema_informatico?: string
          nif_emisor?: string
          numero_instalacion?: number
          ultima_factura_id?: string | null
          ultimo_hash?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "verifactu_chain_status_center_id_fkey"
            columns: ["center_id"]
            isOneToOne: false
            referencedRelation: "centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "verifactu_chain_status_center_id_fkey"
            columns: ["center_id"]
            isOneToOne: false
            referencedRelation: "portal_centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "verifactu_chain_status_ultima_factura_id_fkey"
            columns: ["ultima_factura_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      verifactu_events: {
        Row: {
          aeat_csv: string | null
          aeat_response_code: string | null
          aeat_response_message: string | null
          aeat_response_xml: string | null
          center_id: string
          created_at: string
          environment: string | null
          error_details: string | null
          event_type: string
          http_status: number | null
          id: string
          invoice_id: string | null
          retry_count: number | null
          xml_sent: string | null
        }
        Insert: {
          aeat_csv?: string | null
          aeat_response_code?: string | null
          aeat_response_message?: string | null
          aeat_response_xml?: string | null
          center_id: string
          created_at?: string
          environment?: string | null
          error_details?: string | null
          event_type: string
          http_status?: number | null
          id?: string
          invoice_id?: string | null
          retry_count?: number | null
          xml_sent?: string | null
        }
        Update: {
          aeat_csv?: string | null
          aeat_response_code?: string | null
          aeat_response_message?: string | null
          aeat_response_xml?: string | null
          center_id?: string
          created_at?: string
          environment?: string | null
          error_details?: string | null
          event_type?: string
          http_status?: number | null
          id?: string
          invoice_id?: string | null
          retry_count?: number | null
          xml_sent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "verifactu_events_center_id_fkey"
            columns: ["center_id"]
            isOneToOne: false
            referencedRelation: "centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "verifactu_events_center_id_fkey"
            columns: ["center_id"]
            isOneToOne: false
            referencedRelation: "portal_centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "verifactu_events_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      portal_centers: {
        Row: {
          city: string | null
          country: string | null
          id: string | null
          logo_url: string | null
          name: string | null
          portal_allow_professional_selection: boolean | null
          portal_default_professional_id: string | null
          portal_enabled: boolean | null
          portal_require_approval: boolean | null
          portal_slug: string | null
          province: string | null
          public_booking_enabled: boolean | null
          reschedule_max_days: number | null
          reschedule_require_confirmation: boolean | null
          reschedule_slot_duration: number | null
        }
        Insert: {
          city?: string | null
          country?: string | null
          id?: string | null
          logo_url?: string | null
          name?: string | null
          portal_allow_professional_selection?: boolean | null
          portal_default_professional_id?: string | null
          portal_enabled?: boolean | null
          portal_require_approval?: boolean | null
          portal_slug?: string | null
          province?: string | null
          public_booking_enabled?: boolean | null
          reschedule_max_days?: number | null
          reschedule_require_confirmation?: boolean | null
          reschedule_slot_duration?: number | null
        }
        Update: {
          city?: string | null
          country?: string | null
          id?: string | null
          logo_url?: string | null
          name?: string | null
          portal_allow_professional_selection?: boolean | null
          portal_default_professional_id?: string | null
          portal_enabled?: boolean | null
          portal_require_approval?: boolean | null
          portal_slug?: string | null
          province?: string | null
          public_booking_enabled?: boolean | null
          reschedule_max_days?: number | null
          reschedule_require_confirmation?: boolean | null
          reschedule_slot_duration?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "centers_portal_default_professional_id_fkey"
            columns: ["portal_default_professional_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      apply_bono_to_session: {
        Args: { p_bono_id: string; p_session_id: string }
        Returns: Json
      }
      bootstrap_create_center: {
        Args: {
          p_address?: string
          p_city?: string
          p_email?: string
          p_name: string
          p_phone?: string
          p_postal_code?: string
          p_tax_id?: string
        }
        Returns: string
      }
      convert_calendar_event_to_session: {
        Args: {
          p_bono_id?: string
          p_calendar_event_id: string
          p_location_id?: string
          p_notes?: string
          p_patient_id: string
          p_price: number
          p_session_modality?: string
          p_session_type: string
        }
        Returns: string
      }
      create_session_type_with_order: {
        Args: {
          p_center_id: string
          p_color: string
          p_commission_rate?: number
          p_default_price: number
          p_duration_minutes: number
          p_exemption_code?: string
          p_is_public?: boolean
          p_name: string
          p_non_subject_code?: string
          p_tax_treatment?: string
          p_vat_rate?: number
          p_vat_regime_key?: string
        }
        Returns: string
      }
      delete_bono_safely: { Args: { p_bono_id: string }; Returns: Json }
      delete_payment_and_recompute_debt_v2: {
        Args: { p_payment_id: string }
        Returns: Json
      }
      get_assessment_token: { Args: never; Returns: string }
      get_bono_sessions: {
        Args: { p_bono_id: string }
        Returns: {
          consumes_bono: boolean
          patient_name: string
          professional_name: string
          session_date: string
          session_id: string
          session_status: string
          session_type_name: string
        }[]
      }
      get_center_address_for_session_token: {
        Args: never
        Returns: {
          center_address: string
          center_name: string
        }[]
      }
      get_consent_token: { Args: never; Returns: string }
      get_debt_id_for_payment_by_invoice: {
        Args: { p_payment_id: string }
        Returns: string
      }
      get_invoice_token: { Args: never; Returns: string }
      get_portal_center: {
        Args: { p_slug: string }
        Returns: {
          city: string
          country: string
          id: string
          logo_url: string
          name: string
          portal_allow_professional_selection: boolean
          portal_default_professional_id: string
          portal_enabled: boolean
          portal_require_approval: boolean
          portal_slug: string
          province: string
          reschedule_max_days: number
          reschedule_require_confirmation: boolean
          reschedule_slot_duration: number
        }[]
      }
      get_public_center_info: {
        Args: { p_center_id: string }
        Returns: {
          address: string
          city: string
          email: string
          id: string
          invoice_footer: string
          invoice_logo_url: string
          name: string
          phone: string
          postal_code: string
          province: string
        }[]
      }
      get_session_token: { Args: never; Returns: string }
      get_user_center_id: { Args: { _user_id: string }; Returns: string }
      handle_rectificativa_payments: {
        Args: { p_original_invoice_id: string }
        Returns: Json
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      has_role_in_center: {
        Args: {
          _center_id: string
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
      is_professional: { Args: { _user_id: string }; Returns: boolean }
      portal_list_locations: {
        Args: {
          p_center_slug: string
          p_location_type?: Database["public"]["Enums"]["location_type_enum"]
        }
        Returns: {
          city: string
          id: string
          location_type: Database["public"]["Enums"]["location_type_enum"]
          name: string
          street: string
        }[]
      }
      portal_list_professionals: {
        Args: { _portal_slug: string }
        Returns: {
          avatar_url: string
          first_name: string
          id: string
          last_name: string
          specialty: string
        }[]
      }
      recompute_debt_by_invoice: { Args: { p_debt_id: string }; Returns: Json }
      remove_bono_from_session: {
        Args: { p_session_id: string }
        Returns: Json
      }
      reorder_session_types: {
        Args: { p_center_id: string; p_ordered_ids: string[] }
        Returns: Json
      }
      update_payment_and_recompute_debt_v2: {
        Args: {
          p_amount: number
          p_notes?: string
          p_payment_date: string
          p_payment_id: string
          p_payment_method: string
          p_reference?: string
        }
        Returns: Json
      }
      user_can_create_center: { Args: { _user_id: string }; Returns: boolean }
      verify_assessment_token: {
        Args: { assessment_uuid: string }
        Returns: boolean
      }
      verify_assessment_token_for_patient: {
        Args: { patient_uuid: string }
        Returns: boolean
      }
      verify_assessment_token_for_template: {
        Args: { template_uuid: string }
        Returns: boolean
      }
      verify_consent_token: { Args: { consent_uuid: string }; Returns: boolean }
      verify_consent_token_for_center: {
        Args: { center_uuid: string }
        Returns: boolean
      }
      verify_consent_token_for_patient: {
        Args: { patient_uuid: string }
        Returns: boolean
      }
      verify_consent_token_for_professional: {
        Args: { professional_uuid: string }
        Returns: boolean
      }
      verify_consent_token_for_template: {
        Args: { template_uuid: string }
        Returns: boolean
      }
      verify_invoice_token_for_center: {
        Args: { center_uuid: string }
        Returns: boolean
      }
      verify_session_token_for_center: {
        Args: { center_uuid: string }
        Returns: boolean
      }
      verify_session_token_for_location: {
        Args: { location_uuid: string }
        Returns: boolean
      }
      verify_session_token_for_patient: {
        Args: { patient_uuid: string }
        Returns: boolean
      }
      verify_session_token_for_professional: {
        Args: { professional_uuid: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "professional" | "patient"
      assessment_status: "pending" | "completed" | "expired" | "revoked"
      bono_status: "active" | "exhausted" | "expired" | "cancelled"
      consent_status: "pending" | "signed" | "revoked" | "expired"
      invoice_status: "draft" | "issued" | "paid" | "cancelled"
      location_type_enum: "in_person" | "online"
      notification_status: "pending" | "sent" | "failed"
      notification_type: "email" | "sms" | "whatsapp"
      patient_status: "active" | "inactive" | "discharged"
      payment_status: "pending" | "paid" | "partial" | "refunded"
      session_status:
        | "draft"
        | "scheduled"
        | "confirmed"
        | "completed"
        | "cancelled"
        | "no_show"
        | "blocked"
        | "pending_approval"
        | "reschedule_requested"
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
      app_role: ["admin", "professional", "patient"],
      assessment_status: ["pending", "completed", "expired", "revoked"],
      bono_status: ["active", "exhausted", "expired", "cancelled"],
      consent_status: ["pending", "signed", "revoked", "expired"],
      invoice_status: ["draft", "issued", "paid", "cancelled"],
      location_type_enum: ["in_person", "online"],
      notification_status: ["pending", "sent", "failed"],
      notification_type: ["email", "sms", "whatsapp"],
      patient_status: ["active", "inactive", "discharged"],
      payment_status: ["pending", "paid", "partial", "refunded"],
      session_status: [
        "draft",
        "scheduled",
        "confirmed",
        "completed",
        "cancelled",
        "no_show",
        "blocked",
        "pending_approval",
        "reschedule_requested",
      ],
    },
  },
} as const

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
            foreignKeyName: "bonos_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      center_locations: {
        Row: {
          center_id: string
          city: string
          country: string | null
          created_at: string | null
          id: string
          is_active: boolean | null
          name: string
          number_details: string | null
          postal_code: string | null
          street: string
          updated_at: string | null
        }
        Insert: {
          center_id: string
          city: string
          country?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          number_details?: string | null
          postal_code?: string | null
          street: string
          updated_at?: string | null
        }
        Update: {
          center_id?: string
          city?: string
          country?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          number_details?: string | null
          postal_code?: string | null
          street?: string
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
        ]
      }
      centers: {
        Row: {
          address: string | null
          address_details: string | null
          auto_invoicing_enabled: boolean | null
          city: string | null
          country: string | null
          created_at: string
          default_tax_name: string | null
          default_tax_rate: number | null
          email: string | null
          id: string
          include_tax_in_price: boolean | null
          invoice_footer: string | null
          invoice_logo_url: string | null
          invoice_next_number: number | null
          invoice_prefix: string | null
          logo_url: string | null
          name: string
          phone: string | null
          postal_code: string | null
          province: string | null
          retention_name: string | null
          retention_rate: number | null
          tax_id: string | null
          updated_at: string
          whatsapp_access_token: string | null
          whatsapp_business_account_id: string | null
          whatsapp_phone_number_id: string | null
          whatsapp_send_method: string | null
        }
        Insert: {
          address?: string | null
          address_details?: string | null
          auto_invoicing_enabled?: boolean | null
          city?: string | null
          country?: string | null
          created_at?: string
          default_tax_name?: string | null
          default_tax_rate?: number | null
          email?: string | null
          id?: string
          include_tax_in_price?: boolean | null
          invoice_footer?: string | null
          invoice_logo_url?: string | null
          invoice_next_number?: number | null
          invoice_prefix?: string | null
          logo_url?: string | null
          name: string
          phone?: string | null
          postal_code?: string | null
          province?: string | null
          retention_name?: string | null
          retention_rate?: number | null
          tax_id?: string | null
          updated_at?: string
          whatsapp_access_token?: string | null
          whatsapp_business_account_id?: string | null
          whatsapp_phone_number_id?: string | null
          whatsapp_send_method?: string | null
        }
        Update: {
          address?: string | null
          address_details?: string | null
          auto_invoicing_enabled?: boolean | null
          city?: string | null
          country?: string | null
          created_at?: string
          default_tax_name?: string | null
          default_tax_rate?: number | null
          email?: string | null
          id?: string
          include_tax_in_price?: boolean | null
          invoice_footer?: string | null
          invoice_logo_url?: string | null
          invoice_next_number?: number | null
          invoice_prefix?: string | null
          logo_url?: string | null
          name?: string
          phone?: string | null
          postal_code?: string | null
          province?: string | null
          retention_name?: string | null
          retention_rate?: number | null
          tax_id?: string | null
          updated_at?: string
          whatsapp_access_token?: string | null
          whatsapp_business_account_id?: string | null
          whatsapp_phone_number_id?: string | null
          whatsapp_send_method?: string | null
        }
        Relationships: []
      }
      communication_templates: {
        Row: {
          center_id: string
          channel: string
          created_at: string | null
          email_confirmation_text: string | null
          email_initial_text: string | null
          email_payment_text: string | null
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
          email_initial_text?: string | null
          email_payment_text?: string | null
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
          email_initial_text?: string | null
          email_payment_text?: string | null
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
        ]
      }
      debts: {
        Row: {
          amount: number
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
          updated_at: string
        }
        Insert: {
          amount: number
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
          updated_at?: string
        }
        Update: {
          amount?: number
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
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "debts_center_id_fkey"
            columns: ["center_id"]
            isOneToOne: false
            referencedRelation: "centers"
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
      invoice_items: {
        Row: {
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
        ]
      }
      invoices: {
        Row: {
          center_id: string
          created_at: string
          due_date: string | null
          id: string
          invoice_number: string
          is_recapitulative: boolean | null
          issue_date: string
          notes: string | null
          patient_id: string
          retention_amount: number | null
          retention_rate: number | null
          status: Database["public"]["Enums"]["invoice_status"] | null
          subtotal: number
          tax_amount: number | null
          tax_rate: number | null
          total: number
          updated_at: string
          verifactu_hash: string | null
          verifactu_timestamp: string | null
        }
        Insert: {
          center_id: string
          created_at?: string
          due_date?: string | null
          id?: string
          invoice_number: string
          is_recapitulative?: boolean | null
          issue_date?: string
          notes?: string | null
          patient_id: string
          retention_amount?: number | null
          retention_rate?: number | null
          status?: Database["public"]["Enums"]["invoice_status"] | null
          subtotal?: number
          tax_amount?: number | null
          tax_rate?: number | null
          total?: number
          updated_at?: string
          verifactu_hash?: string | null
          verifactu_timestamp?: string | null
        }
        Update: {
          center_id?: string
          created_at?: string
          due_date?: string | null
          id?: string
          invoice_number?: string
          is_recapitulative?: boolean | null
          issue_date?: string
          notes?: string | null
          patient_id?: string
          retention_amount?: number | null
          retention_rate?: number | null
          status?: Database["public"]["Enums"]["invoice_status"] | null
          subtotal?: number
          tax_amount?: number | null
          tax_rate?: number | null
          total?: number
          updated_at?: string
          verifactu_hash?: string | null
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
            foreignKeyName: "invoices_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
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
        ]
      }
      session_types: {
        Row: {
          center_id: string
          color: string
          commission_rate: number | null
          created_at: string | null
          default_price: number
          duration_minutes: number
          id: string
          is_active: boolean | null
          name: string
          updated_at: string | null
        }
        Insert: {
          center_id: string
          color?: string
          commission_rate?: number | null
          created_at?: string | null
          default_price?: number
          duration_minutes?: number
          id?: string
          is_active?: boolean | null
          name: string
          updated_at?: string | null
        }
        Update: {
          center_id?: string
          color?: string
          commission_rate?: number | null
          created_at?: string | null
          default_price?: number
          duration_minutes?: number
          id?: string
          is_active?: boolean | null
          name?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "session_types_center_id_fkey"
            columns: ["center_id"]
            isOneToOne: false
            referencedRelation: "centers"
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
          id: string
          location_id: string | null
          notes: string | null
          patient_id: string
          price: number
          professional_id: string
          room: string | null
          send_reminder_email: boolean | null
          send_reminder_sms: boolean | null
          send_reminder_whatsapp: boolean | null
          session_date: string
          session_modality: string | null
          session_type: string | null
          start_time: string
          status: Database["public"]["Enums"]["session_status"] | null
          updated_at: string
          video_call_link: string | null
        }
        Insert: {
          access_token?: string | null
          bono_id?: string | null
          cancellation_policy?: string | null
          cancellation_reason?: string | null
          center_id: string
          created_at?: string
          end_time: string
          id?: string
          location_id?: string | null
          notes?: string | null
          patient_id: string
          price?: number
          professional_id: string
          room?: string | null
          send_reminder_email?: boolean | null
          send_reminder_sms?: boolean | null
          send_reminder_whatsapp?: boolean | null
          session_date: string
          session_modality?: string | null
          session_type?: string | null
          start_time: string
          status?: Database["public"]["Enums"]["session_status"] | null
          updated_at?: string
          video_call_link?: string | null
        }
        Update: {
          access_token?: string | null
          bono_id?: string | null
          cancellation_policy?: string | null
          cancellation_reason?: string | null
          center_id?: string
          created_at?: string
          end_time?: string
          id?: string
          location_id?: string | null
          notes?: string | null
          patient_id?: string
          price?: number
          professional_id?: string
          room?: string | null
          send_reminder_email?: boolean | null
          send_reminder_sms?: boolean | null
          send_reminder_whatsapp?: boolean | null
          session_date?: string
          session_modality?: string | null
          session_type?: string | null
          start_time?: string
          status?: Database["public"]["Enums"]["session_status"] | null
          updated_at?: string
          video_call_link?: string | null
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
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_user_center_id: { Args: { _user_id: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
      is_professional: { Args: { _user_id: string }; Returns: boolean }
      user_can_create_center: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "professional" | "patient"
      bono_status: "active" | "exhausted" | "expired" | "cancelled"
      invoice_status: "draft" | "issued" | "paid" | "cancelled"
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
      bono_status: ["active", "exhausted", "expired", "cancelled"],
      invoice_status: ["draft", "issued", "paid", "cancelled"],
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
      ],
    },
  },
} as const

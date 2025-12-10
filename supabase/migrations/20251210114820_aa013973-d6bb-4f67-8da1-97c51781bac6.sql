-- =====================================================
-- PSYNUMA DATABASE SCHEMA - Phase 1: Foundation
-- =====================================================

-- 1. Create ENUM types
CREATE TYPE public.app_role AS ENUM ('admin', 'professional', 'patient');
CREATE TYPE public.session_status AS ENUM ('scheduled', 'confirmed', 'completed', 'cancelled', 'no_show');
CREATE TYPE public.payment_status AS ENUM ('pending', 'paid', 'partial', 'refunded');
CREATE TYPE public.invoice_status AS ENUM ('draft', 'issued', 'paid', 'cancelled');
CREATE TYPE public.notification_type AS ENUM ('email', 'sms', 'whatsapp');
CREATE TYPE public.notification_status AS ENUM ('pending', 'sent', 'failed');
CREATE TYPE public.patient_status AS ENUM ('active', 'inactive', 'discharged');
CREATE TYPE public.bono_status AS ENUM ('active', 'exhausted', 'expired', 'cancelled');

-- 2. Centers table (clinic information)
CREATE TABLE public.centers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    tax_id TEXT,
    address TEXT,
    city TEXT,
    postal_code TEXT,
    phone TEXT,
    email TEXT,
    logo_url TEXT,
    invoice_prefix TEXT DEFAULT 'FAC',
    invoice_next_number INTEGER DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- 3. Profiles table (user profiles linked to auth.users)
CREATE TABLE public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    center_id UUID REFERENCES public.centers(id) ON DELETE SET NULL,
    email TEXT NOT NULL,
    first_name TEXT,
    last_name TEXT,
    phone TEXT,
    avatar_url TEXT,
    specialty TEXT,
    license_number TEXT,
    commission_rate DECIMAL(5,2) DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- 4. User roles table (RBAC)
CREATE TABLE public.user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    role app_role NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    UNIQUE (user_id, role)
);

-- 5. Patients table
CREATE TABLE public.patients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    center_id UUID REFERENCES public.centers(id) ON DELETE CASCADE NOT NULL,
    assigned_professional_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    date_of_birth DATE,
    gender TEXT,
    address TEXT,
    city TEXT,
    postal_code TEXT,
    tax_id TEXT,
    emergency_contact_name TEXT,
    emergency_contact_phone TEXT,
    notes TEXT,
    status patient_status DEFAULT 'active',
    is_minor BOOLEAN DEFAULT false,
    guardian_name TEXT,
    guardian_phone TEXT,
    guardian_email TEXT,
    guardian_relationship TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- 6. Patient portal accounts
CREATE TABLE public.patient_portal_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID REFERENCES public.patients(id) ON DELETE CASCADE NOT NULL UNIQUE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    is_active BOOLEAN DEFAULT true,
    last_login_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- 7. Availability table
CREATE TABLE public.availability (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    professional_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    day_of_week INTEGER NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    is_available BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- 8. Sessions table
CREATE TABLE public.sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    center_id UUID REFERENCES public.centers(id) ON DELETE CASCADE NOT NULL,
    patient_id UUID REFERENCES public.patients(id) ON DELETE CASCADE NOT NULL,
    professional_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL NOT NULL,
    bono_id UUID,
    session_date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    session_type TEXT DEFAULT 'individual',
    status session_status DEFAULT 'scheduled',
    price DECIMAL(10,2) NOT NULL DEFAULT 0,
    notes TEXT,
    cancellation_reason TEXT,
    send_reminder_email BOOLEAN DEFAULT true,
    send_reminder_sms BOOLEAN DEFAULT false,
    send_reminder_whatsapp BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- 9. Bonos table (session packages)
CREATE TABLE public.bonos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    center_id UUID REFERENCES public.centers(id) ON DELETE CASCADE NOT NULL,
    patient_id UUID REFERENCES public.patients(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    total_sessions INTEGER NOT NULL,
    used_sessions INTEGER DEFAULT 0,
    price_per_session DECIMAL(10,2) NOT NULL,
    total_price DECIMAL(10,2) NOT NULL,
    status bono_status DEFAULT 'active',
    expires_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Add foreign key for sessions.bono_id after bonos table exists
ALTER TABLE public.sessions ADD CONSTRAINT sessions_bono_id_fkey 
    FOREIGN KEY (bono_id) REFERENCES public.bonos(id) ON DELETE SET NULL;

-- 10. Bono items (individual session usage tracking)
CREATE TABLE public.bono_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bono_id UUID REFERENCES public.bonos(id) ON DELETE CASCADE NOT NULL,
    session_id UUID REFERENCES public.sessions(id) ON DELETE SET NULL,
    used_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- 11. Invoices table
CREATE TABLE public.invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    center_id UUID REFERENCES public.centers(id) ON DELETE CASCADE NOT NULL,
    patient_id UUID REFERENCES public.patients(id) ON DELETE CASCADE NOT NULL,
    invoice_number TEXT NOT NULL,
    issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
    due_date DATE,
    subtotal DECIMAL(10,2) NOT NULL DEFAULT 0,
    tax_rate DECIMAL(5,2) DEFAULT 21,
    tax_amount DECIMAL(10,2) DEFAULT 0,
    total DECIMAL(10,2) NOT NULL DEFAULT 0,
    status invoice_status DEFAULT 'draft',
    is_recapitulative BOOLEAN DEFAULT false,
    verifactu_hash TEXT,
    verifactu_timestamp TIMESTAMP WITH TIME ZONE,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- 12. Invoice items
CREATE TABLE public.invoice_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id UUID REFERENCES public.invoices(id) ON DELETE CASCADE NOT NULL,
    session_id UUID REFERENCES public.sessions(id) ON DELETE SET NULL,
    description TEXT NOT NULL,
    quantity INTEGER DEFAULT 1,
    unit_price DECIMAL(10,2) NOT NULL,
    total DECIMAL(10,2) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- 13. Payments table
CREATE TABLE public.payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    center_id UUID REFERENCES public.centers(id) ON DELETE CASCADE NOT NULL,
    invoice_id UUID REFERENCES public.invoices(id) ON DELETE SET NULL,
    patient_id UUID REFERENCES public.patients(id) ON DELETE CASCADE NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    payment_method TEXT DEFAULT 'cash',
    payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
    reference TEXT,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- 14. Debts table
CREATE TABLE public.debts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    center_id UUID REFERENCES public.centers(id) ON DELETE CASCADE NOT NULL,
    patient_id UUID REFERENCES public.patients(id) ON DELETE CASCADE NOT NULL,
    invoice_id UUID REFERENCES public.invoices(id) ON DELETE SET NULL,
    session_id UUID REFERENCES public.sessions(id) ON DELETE SET NULL,
    amount DECIMAL(10,2) NOT NULL,
    paid_amount DECIMAL(10,2) DEFAULT 0,
    status payment_status DEFAULT 'pending',
    due_date DATE,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- 15. Notifications table
CREATE TABLE public.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    center_id UUID REFERENCES public.centers(id) ON DELETE CASCADE NOT NULL,
    patient_id UUID REFERENCES public.patients(id) ON DELETE CASCADE,
    session_id UUID REFERENCES public.sessions(id) ON DELETE CASCADE,
    type notification_type NOT NULL,
    status notification_status DEFAULT 'pending',
    recipient TEXT NOT NULL,
    subject TEXT,
    message TEXT NOT NULL,
    scheduled_for TIMESTAMP WITH TIME ZONE,
    sent_at TIMESTAMP WITH TIME ZONE,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- 16. Audit log table
CREATE TABLE public.audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    table_name TEXT NOT NULL,
    record_id UUID,
    old_values JSONB,
    new_values JSONB,
    ip_address TEXT,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- =====================================================
-- SECURITY DEFINER FUNCTIONS FOR RBAC
-- =====================================================

-- Function to check if user has a specific role
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.user_roles
        WHERE user_id = _user_id
          AND role = _role
    )
$$;

-- Function to check if user is admin
CREATE OR REPLACE FUNCTION public.is_admin(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT public.has_role(_user_id, 'admin')
$$;

-- Function to check if user is professional
CREATE OR REPLACE FUNCTION public.is_professional(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT public.has_role(_user_id, 'professional')
$$;

-- Function to get user's center_id
CREATE OR REPLACE FUNCTION public.get_user_center_id(_user_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT center_id FROM public.profiles WHERE id = _user_id
$$;

-- =====================================================
-- ENABLE RLS ON ALL TABLES
-- =====================================================

ALTER TABLE public.centers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patient_portal_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bonos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bono_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.debts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- RLS POLICIES
-- =====================================================

-- CENTERS policies
CREATE POLICY "Users can view their center" ON public.centers
    FOR SELECT TO authenticated
    USING (id = public.get_user_center_id(auth.uid()) OR public.is_admin(auth.uid()));

CREATE POLICY "Admins can manage centers" ON public.centers
    FOR ALL TO authenticated
    USING (public.is_admin(auth.uid()));

-- PROFILES policies
CREATE POLICY "Users can view profiles in their center" ON public.profiles
    FOR SELECT TO authenticated
    USING (center_id = public.get_user_center_id(auth.uid()) OR id = auth.uid());

CREATE POLICY "Users can update their own profile" ON public.profiles
    FOR UPDATE TO authenticated
    USING (id = auth.uid());

CREATE POLICY "Admins can manage all profiles" ON public.profiles
    FOR ALL TO authenticated
    USING (public.is_admin(auth.uid()));

CREATE POLICY "Users can insert their own profile" ON public.profiles
    FOR INSERT TO authenticated
    WITH CHECK (id = auth.uid());

-- USER_ROLES policies
CREATE POLICY "Users can view their own roles" ON public.user_roles
    FOR SELECT TO authenticated
    USING (user_id = auth.uid() OR public.is_admin(auth.uid()));

CREATE POLICY "Admins can manage roles" ON public.user_roles
    FOR ALL TO authenticated
    USING (public.is_admin(auth.uid()));

-- PATIENTS policies
CREATE POLICY "Professionals can view patients in their center" ON public.patients
    FOR SELECT TO authenticated
    USING (
        center_id = public.get_user_center_id(auth.uid())
        AND (public.is_admin(auth.uid()) OR public.is_professional(auth.uid()))
    );

CREATE POLICY "Professionals can manage patients" ON public.patients
    FOR ALL TO authenticated
    USING (
        center_id = public.get_user_center_id(auth.uid())
        AND (public.is_admin(auth.uid()) OR public.is_professional(auth.uid()))
    );

-- PATIENT_PORTAL_ACCOUNTS policies
CREATE POLICY "Patients can view their own portal account" ON public.patient_portal_accounts
    FOR SELECT TO authenticated
    USING (user_id = auth.uid());

CREATE POLICY "Admins and professionals can manage portal accounts" ON public.patient_portal_accounts
    FOR ALL TO authenticated
    USING (public.is_admin(auth.uid()) OR public.is_professional(auth.uid()));

-- AVAILABILITY policies
CREATE POLICY "View availability in center" ON public.availability
    FOR SELECT TO authenticated
    USING (
        professional_id IN (
            SELECT id FROM public.profiles WHERE center_id = public.get_user_center_id(auth.uid())
        )
    );

CREATE POLICY "Professionals can manage their availability" ON public.availability
    FOR ALL TO authenticated
    USING (professional_id = auth.uid() OR public.is_admin(auth.uid()));

-- SESSIONS policies
CREATE POLICY "View sessions in center" ON public.sessions
    FOR SELECT TO authenticated
    USING (center_id = public.get_user_center_id(auth.uid()));

CREATE POLICY "Professionals can manage sessions" ON public.sessions
    FOR ALL TO authenticated
    USING (
        center_id = public.get_user_center_id(auth.uid())
        AND (public.is_admin(auth.uid()) OR public.is_professional(auth.uid()))
    );

-- BONOS policies
CREATE POLICY "View bonos in center" ON public.bonos
    FOR SELECT TO authenticated
    USING (center_id = public.get_user_center_id(auth.uid()));

CREATE POLICY "Manage bonos in center" ON public.bonos
    FOR ALL TO authenticated
    USING (
        center_id = public.get_user_center_id(auth.uid())
        AND (public.is_admin(auth.uid()) OR public.is_professional(auth.uid()))
    );

-- BONO_ITEMS policies
CREATE POLICY "View bono items" ON public.bono_items
    FOR SELECT TO authenticated
    USING (
        bono_id IN (
            SELECT id FROM public.bonos WHERE center_id = public.get_user_center_id(auth.uid())
        )
    );

CREATE POLICY "Manage bono items" ON public.bono_items
    FOR ALL TO authenticated
    USING (
        bono_id IN (
            SELECT id FROM public.bonos WHERE center_id = public.get_user_center_id(auth.uid())
        )
        AND (public.is_admin(auth.uid()) OR public.is_professional(auth.uid()))
    );

-- INVOICES policies
CREATE POLICY "View invoices in center" ON public.invoices
    FOR SELECT TO authenticated
    USING (center_id = public.get_user_center_id(auth.uid()));

CREATE POLICY "Manage invoices in center" ON public.invoices
    FOR ALL TO authenticated
    USING (
        center_id = public.get_user_center_id(auth.uid())
        AND (public.is_admin(auth.uid()) OR public.is_professional(auth.uid()))
    );

-- INVOICE_ITEMS policies
CREATE POLICY "View invoice items" ON public.invoice_items
    FOR SELECT TO authenticated
    USING (
        invoice_id IN (
            SELECT id FROM public.invoices WHERE center_id = public.get_user_center_id(auth.uid())
        )
    );

CREATE POLICY "Manage invoice items" ON public.invoice_items
    FOR ALL TO authenticated
    USING (
        invoice_id IN (
            SELECT id FROM public.invoices WHERE center_id = public.get_user_center_id(auth.uid())
        )
        AND (public.is_admin(auth.uid()) OR public.is_professional(auth.uid()))
    );

-- PAYMENTS policies
CREATE POLICY "View payments in center" ON public.payments
    FOR SELECT TO authenticated
    USING (center_id = public.get_user_center_id(auth.uid()));

CREATE POLICY "Manage payments" ON public.payments
    FOR ALL TO authenticated
    USING (
        center_id = public.get_user_center_id(auth.uid())
        AND (public.is_admin(auth.uid()) OR public.is_professional(auth.uid()))
    );

-- DEBTS policies
CREATE POLICY "View debts in center" ON public.debts
    FOR SELECT TO authenticated
    USING (center_id = public.get_user_center_id(auth.uid()));

CREATE POLICY "Manage debts" ON public.debts
    FOR ALL TO authenticated
    USING (
        center_id = public.get_user_center_id(auth.uid())
        AND (public.is_admin(auth.uid()) OR public.is_professional(auth.uid()))
    );

-- NOTIFICATIONS policies
CREATE POLICY "View notifications in center" ON public.notifications
    FOR SELECT TO authenticated
    USING (center_id = public.get_user_center_id(auth.uid()));

CREATE POLICY "Manage notifications" ON public.notifications
    FOR ALL TO authenticated
    USING (
        center_id = public.get_user_center_id(auth.uid())
        AND (public.is_admin(auth.uid()) OR public.is_professional(auth.uid()))
    );

-- AUDIT_LOG policies (admin only)
CREATE POLICY "Admins can view audit log" ON public.audit_log
    FOR SELECT TO authenticated
    USING (public.is_admin(auth.uid()));

CREATE POLICY "System can insert audit log" ON public.audit_log
    FOR INSERT TO authenticated
    WITH CHECK (true);

-- =====================================================
-- TRIGGERS FOR UPDATED_AT
-- =====================================================

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_centers_updated_at BEFORE UPDATE ON public.centers
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_patients_updated_at BEFORE UPDATE ON public.patients
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_patient_portal_accounts_updated_at BEFORE UPDATE ON public.patient_portal_accounts
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_availability_updated_at BEFORE UPDATE ON public.availability
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_sessions_updated_at BEFORE UPDATE ON public.sessions
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_bonos_updated_at BEFORE UPDATE ON public.bonos
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_invoices_updated_at BEFORE UPDATE ON public.invoices
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_payments_updated_at BEFORE UPDATE ON public.payments
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_debts_updated_at BEFORE UPDATE ON public.debts
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =====================================================
-- FUNCTION TO CREATE PROFILE ON USER SIGNUP
-- =====================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.profiles (id, email, first_name, last_name)
    VALUES (
        NEW.id,
        NEW.email,
        NEW.raw_user_meta_data ->> 'first_name',
        NEW.raw_user_meta_data ->> 'last_name'
    );
    RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
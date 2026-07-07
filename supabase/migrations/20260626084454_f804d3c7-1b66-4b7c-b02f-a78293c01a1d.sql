
-- =============================================================
-- ENUMS
-- =============================================================
CREATE TYPE public.app_role AS ENUM ('user', 'admin', 'support');
CREATE TYPE public.connector_type AS ENUM ('CCS2', 'CHAdeMO', 'Type2', 'Bharat_AC_001', 'Bharat_DC_001', 'GBT');
CREATE TYPE public.charger_status AS ENUM ('available', 'occupied', 'offline', 'maintenance');
CREATE TYPE public.booking_status AS ENUM ('pending', 'confirmed', 'in_progress', 'completed', 'cancelled', 'no_show');
CREATE TYPE public.payment_status AS ENUM ('created', 'authorized', 'captured', 'failed', 'refunded');
CREATE TYPE public.subscription_status AS ENUM ('active', 'expired', 'cancelled');
CREATE TYPE public.plan_interval AS ENUM ('monthly', 'yearly');
CREATE TYPE public.ticket_status AS ENUM ('open', 'in_progress', 'resolved', 'closed');

-- =============================================================
-- TIMESTAMP TRIGGER FN
-- =============================================================
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = public;

-- =============================================================
-- PROFILES
-- =============================================================
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  phone TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT SELECT ON public.profiles TO anon;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Profiles are viewable by everyone"
  ON public.profiles FOR SELECT USING (true);
CREATE POLICY "Users can insert their own profile"
  ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);
CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, phone, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email,'@',1)),
    NEW.raw_user_meta_data->>'phone',
    NEW.raw_user_meta_data->>'avatar_url'
  ) ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user') ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- =============================================================
-- USER ROLES
-- =============================================================
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE POLICY "Users can read their own roles"
  ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admins can read all roles"
  ON public.user_roles FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins can manage roles"
  ON public.user_roles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

-- Now safe to wire signup trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =============================================================
-- VEHICLES
-- =============================================================
CREATE TABLE public.vehicles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  make TEXT NOT NULL,
  model TEXT NOT NULL,
  battery_kwh NUMERIC(5,1) NOT NULL,
  connector public.connector_type NOT NULL,
  registration TEXT,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vehicles TO authenticated;
GRANT ALL ON public.vehicles TO service_role;
ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own vehicles" ON public.vehicles FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins read all vehicles" ON public.vehicles FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_vehicles_updated BEFORE UPDATE ON public.vehicles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================================
-- STATIONS
-- =============================================================
CREATE TABLE public.stations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  operator TEXT NOT NULL,
  address TEXT NOT NULL,
  city TEXT NOT NULL,
  state TEXT NOT NULL,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  phone TEXT,
  opening_hours TEXT DEFAULT '24x7',
  amenities TEXT[] NOT NULL DEFAULT '{}',
  images TEXT[] NOT NULL DEFAULT '{}',
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.stations TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.stations TO authenticated;
GRANT ALL ON public.stations TO service_role;
ALTER TABLE public.stations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read stations" ON public.stations FOR SELECT USING (true);
CREATE POLICY "Admins manage stations" ON public.stations FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_stations_updated BEFORE UPDATE ON public.stations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_stations_geo ON public.stations(lat, lng);
CREATE INDEX idx_stations_city ON public.stations(city);

-- =============================================================
-- CHARGERS
-- =============================================================
CREATE TABLE public.chargers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  station_id UUID NOT NULL REFERENCES public.stations(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  connector public.connector_type NOT NULL,
  power_kw NUMERIC(5,1) NOT NULL,
  status public.charger_status NOT NULL DEFAULT 'available',
  price_per_kwh NUMERIC(6,2) NOT NULL DEFAULT 18.00,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.chargers TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.chargers TO authenticated;
GRANT ALL ON public.chargers TO service_role;
ALTER TABLE public.chargers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read chargers" ON public.chargers FOR SELECT USING (true);
CREATE POLICY "Admins manage chargers" ON public.chargers FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_chargers_updated BEFORE UPDATE ON public.chargers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_chargers_station ON public.chargers(station_id);

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.chargers;

-- =============================================================
-- FAVORITES
-- =============================================================
CREATE TABLE public.favorites (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  station_id UUID NOT NULL REFERENCES public.stations(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, station_id)
);
GRANT SELECT, INSERT, DELETE ON public.favorites TO authenticated;
GRANT ALL ON public.favorites TO service_role;
ALTER TABLE public.favorites ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own favorites" ON public.favorites FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- =============================================================
-- PLANS
-- =============================================================
CREATE TABLE public.plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  interval public.plan_interval NOT NULL,
  price_inr NUMERIC(10,2) NOT NULL,
  features TEXT[] NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.plans TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.plans TO authenticated;
GRANT ALL ON public.plans TO service_role;
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read active plans" ON public.plans FOR SELECT USING (is_active);
CREATE POLICY "Admins manage plans" ON public.plans FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

INSERT INTO public.plans (code, name, interval, price_inr, features) VALUES
  ('monthly', 'Monthly', 'monthly', 999.00, ARRAY['Unlimited bookings','Priority slots','Long reservation up to 2h','Email & in-app reminders']),
  ('yearly',  'Yearly',  'yearly',  9999.00, ARRAY['Everything in Monthly','Save ₹1989/year','Free booking extensions','Dedicated support']);

-- =============================================================
-- SUBSCRIPTIONS
-- =============================================================
CREATE TABLE public.subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES public.plans(id),
  status public.subscription_status NOT NULL DEFAULT 'active',
  starts_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  auto_renew BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.subscriptions TO authenticated;
GRANT ALL ON public.subscriptions TO service_role;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own subscriptions" ON public.subscriptions FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins manage subscriptions" ON public.subscriptions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_subs_updated BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_subs_user_active ON public.subscriptions(user_id, status, expires_at);

CREATE OR REPLACE FUNCTION public.is_premium(_user_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.subscriptions
    WHERE user_id = _user_id AND status = 'active' AND expires_at > now()
  )
$$;

-- =============================================================
-- PAYMENTS
-- =============================================================
CREATE TABLE public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id UUID REFERENCES public.plans(id),
  subscription_id UUID REFERENCES public.subscriptions(id) ON DELETE SET NULL,
  amount_inr NUMERIC(10,2) NOT NULL,
  gst_inr NUMERIC(10,2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'INR',
  razorpay_order_id TEXT NOT NULL,
  razorpay_payment_id TEXT,
  razorpay_signature TEXT,
  status public.payment_status NOT NULL DEFAULT 'created',
  invoice_no TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.payments TO authenticated;
GRANT ALL ON public.payments TO service_role;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own payments" ON public.payments FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_payments_updated BEFORE UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE UNIQUE INDEX idx_payments_order ON public.payments(razorpay_order_id);

-- =============================================================
-- BOOKINGS  (with overlap-prevention)
-- =============================================================
CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE TABLE public.bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  charger_id UUID NOT NULL REFERENCES public.chargers(id) ON DELETE CASCADE,
  vehicle_id UUID REFERENCES public.vehicles(id) ON DELETE SET NULL,
  station_id UUID NOT NULL REFERENCES public.stations(id) ON DELETE CASCADE,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  during TSTZRANGE GENERATED ALWAYS AS (tstzrange(starts_at, ends_at, '[)')) STORED,
  status public.booking_status NOT NULL DEFAULT 'confirmed',
  qr_code TEXT NOT NULL DEFAULT encode(gen_random_bytes(8),'hex'),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at),
  EXCLUDE USING gist (
    charger_id WITH =,
    during WITH &&
  ) WHERE (status IN ('confirmed','in_progress'))
);
GRANT SELECT, INSERT, UPDATE ON public.bookings TO authenticated;
GRANT ALL ON public.bookings TO service_role;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own bookings" ON public.bookings FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'support'));
CREATE POLICY "Premium users create bookings" ON public.bookings FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND public.is_premium(auth.uid()));
CREATE POLICY "Users update own bookings" ON public.bookings FOR UPDATE TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_bookings_updated BEFORE UPDATE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_bookings_user ON public.bookings(user_id, starts_at DESC);
CREATE INDEX idx_bookings_charger ON public.bookings(charger_id, starts_at);

ALTER PUBLICATION supabase_realtime ADD TABLE public.bookings;

-- =============================================================
-- REVIEWS
-- =============================================================
CREATE TABLE public.reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  station_id UUID NOT NULL REFERENCES public.stations(id) ON DELETE CASCADE,
  rating SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, station_id)
);
GRANT SELECT ON public.reviews TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.reviews TO authenticated;
GRANT ALL ON public.reviews TO service_role;
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read reviews" ON public.reviews FOR SELECT USING (true);
CREATE POLICY "Users with bookings can write reviews" ON public.reviews FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.user_id = auth.uid()
        AND b.station_id = reviews.station_id
        AND b.status IN ('confirmed','in_progress','completed')
    )
  );
CREATE POLICY "Users update own reviews" ON public.reviews FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "Users delete own reviews" ON public.reviews FOR DELETE TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(),'admin'));

-- =============================================================
-- NOTIFICATIONS
-- =============================================================
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT,
  link TEXT,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own notifications" ON public.notifications FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "Users update own notifications" ON public.notifications FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

-- =============================================================
-- SUPPORT TICKETS
-- =============================================================
CREATE TABLE public.support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  status public.ticket_status NOT NULL DEFAULT 'open',
  source TEXT NOT NULL DEFAULT 'chatbot',
  assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.support_tickets TO authenticated;
GRANT ALL ON public.support_tickets TO service_role;
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own tickets" ON public.support_tickets FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'support'));
CREATE POLICY "Users create tickets" ON public.support_tickets FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Staff update tickets" ON public.support_tickets FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'support'));
CREATE TRIGGER trg_tickets_updated BEFORE UPDATE ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================================
-- CHAT MESSAGES
-- =============================================================
CREATE TABLE public.chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user','assistant','system')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.chat_messages TO authenticated;
GRANT ALL ON public.chat_messages TO service_role;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own chat" ON public.chat_messages FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "Users insert own chat" ON public.chat_messages FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_chat_user ON public.chat_messages(user_id, created_at);

-- =============================================================
-- SEED STATIONS
-- =============================================================
WITH s AS (
  INSERT INTO public.stations (name, operator, address, city, state, lat, lng, phone, amenities, images, description) VALUES
    ('Tata Power EZ Charge - Indiranagar','Tata Power','100 Feet Rd, Indiranagar','Bengaluru','KA',12.9719,77.6412,'+918012345601',ARRAY['parking','cafe','washroom','wifi'],ARRAY[]::text[],'Premium fast charging hub in Indiranagar'),
    ('Ather Grid - Koramangala','Ather Energy','80 Feet Rd, Koramangala','Bengaluru','KA',12.9352,77.6245,'+918012345602',ARRAY['parking','wifi'],ARRAY[]::text[],'2W & 4W charging point'),
    ('ChargeZone - HSR Layout','ChargeZone','27th Main, HSR Sector 1','Bengaluru','KA',12.9116,77.6473,'+918012345603',ARRAY['parking','washroom'],ARRAY[]::text[],'DC fast charging'),
    ('Statiq - Whitefield','Statiq','ITPL Main Rd, Whitefield','Bengaluru','KA',12.9698,77.7500,'+918012345604',ARRAY['parking','cafe'],ARRAY[]::text[],'Highway-grade fast charger'),
    ('Tata Power - BKC','Tata Power','Bandra Kurla Complex','Mumbai','MH',19.0654,72.8693,'+912212345605',ARRAY['parking','cafe','washroom'],ARRAY[]::text[],'BKC charging hub'),
    ('ChargeGrid - Powai','Magenta','Hiranandani Gardens, Powai','Mumbai','MH',19.1197,72.9089,'+912212345606',ARRAY['parking','wifi'],ARRAY[]::text[],'Premium location'),
    ('Statiq - Andheri West','Statiq','Lokhandwala, Andheri W','Mumbai','MH',19.1364,72.8296,'+912212345607',ARRAY['parking'],ARRAY[]::text[],'Convenient urban charging'),
    ('Ather Grid - Lower Parel','Ather Energy','Phoenix Mills','Mumbai','MH',19.0144,72.8262,'+912212345608',ARRAY['parking','cafe','wifi'],ARRAY[]::text[],'Inside mall premises'),
    ('Tata Power - Connaught Place','Tata Power','Inner Circle, CP','Delhi','DL',28.6315,77.2167,'+911112345609',ARRAY['parking','cafe','washroom','wifi'],ARRAY[]::text[],'Flagship CP charger'),
    ('ChargeZone - Saket','ChargeZone','Select Citywalk, Saket','Delhi','DL',28.5276,77.2196,'+911112345610',ARRAY['parking','cafe'],ARRAY[]::text[],'Mall-side charging'),
    ('Statiq - Gurugram','Statiq','Cyber City, DLF Phase 2','Delhi','DL',28.4949,77.0883,'+911112345611',ARRAY['parking'],ARRAY[]::text[],'Tech park charger'),
    ('Ather Grid - Vasant Kunj','Ather Energy','Ambience Mall','Delhi','DL',28.5417,77.1530,'+911112345612',ARRAY['parking','wifi'],ARRAY[]::text[],'Family-friendly location'),
    ('Tata Power - HITEC City','Tata Power','Madhapur, HITEC City','Hyderabad','TS',17.4485,78.3908,'+914012345613',ARRAY['parking','cafe','washroom'],ARRAY[]::text[],'IT corridor hub'),
    ('ChargeZone - Banjara Hills','ChargeZone','Road No 12, Banjara Hills','Hyderabad','TS',17.4156,78.4347,'+914012345614',ARRAY['parking'],ARRAY[]::text[],'Upscale neighborhood'),
    ('Statiq - Gachibowli','Statiq','Financial District','Hyderabad','TS',17.4239,78.3428,'+914012345615',ARRAY['parking','wifi'],ARRAY[]::text[],'Office area charger'),
    ('Tata Power - Koregaon Park','Tata Power','North Main Rd, Koregaon Park','Pune','MH',18.5362,73.8939,'+912012345616',ARRAY['parking','cafe'],ARRAY[]::text[],'Trendy area location'),
    ('ChargeZone - Hinjewadi','ChargeZone','Rajiv Gandhi IT Park','Pune','MH',18.5908,73.7380,'+912012345617',ARRAY['parking','washroom'],ARRAY[]::text[],'IT park charger'),
    ('Ather Grid - Viman Nagar','Ather Energy','Phoenix Marketcity','Pune','MH',18.5679,73.9143,'+912012345618',ARRAY['parking','cafe','wifi'],ARRAY[]::text[],'Mall charging point')
  RETURNING id, name
)
INSERT INTO public.chargers (station_id, label, connector, power_kw, status, price_per_kwh)
SELECT s.id, 'CH-' || g, c.connector, c.power_kw, c.status, c.price
FROM s
CROSS JOIN LATERAL (
  VALUES
    (1,'CCS2'::public.connector_type,60.0,'available'::public.charger_status,18.50),
    (2,'CCS2'::public.connector_type,30.0,'available'::public.charger_status,16.00),
    (3,'Type2'::public.connector_type,22.0,'available'::public.charger_status,12.50),
    (4,'CHAdeMO'::public.connector_type,50.0,'occupied'::public.charger_status,18.00)
) c(g, connector, power_kw, status, price);

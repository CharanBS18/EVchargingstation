
CREATE TABLE public.helpline_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sender text NOT NULL CHECK (sender IN ('user','admin')),
  content text NOT NULL,
  read_by_admin boolean NOT NULL DEFAULT false,
  read_by_user boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.helpline_messages TO authenticated;
GRANT ALL ON public.helpline_messages TO service_role;

ALTER TABLE public.helpline_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own helpline messages" ON public.helpline_messages
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users insert own helpline messages" ON public.helpline_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    (auth.uid() = user_id AND sender = 'user')
    OR (public.has_role(auth.uid(), 'admin') AND sender = 'admin')
  );

CREATE POLICY "Mark messages read" ON public.helpline_messages
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admin delete helpline" ON public.helpline_messages
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX helpline_messages_user_idx ON public.helpline_messages(user_id, created_at DESC);

ALTER PUBLICATION supabase_realtime ADD TABLE public.helpline_messages;
ALTER TABLE public.helpline_messages REPLICA IDENTITY FULL;

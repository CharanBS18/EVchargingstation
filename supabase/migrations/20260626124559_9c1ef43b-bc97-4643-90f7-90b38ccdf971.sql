GRANT DELETE ON public.support_tickets TO authenticated;
CREATE POLICY "Admins delete tickets" ON public.support_tickets FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin'));
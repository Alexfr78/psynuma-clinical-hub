-- Fix security definer view by setting security_invoker = true
ALTER VIEW public.portal_centers SET (security_invoker = true);
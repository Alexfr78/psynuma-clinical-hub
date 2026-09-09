-- Fix security linter warning: set search_path for the function
ALTER FUNCTION public.apply_bono_to_session(uuid, uuid) SET search_path = public;
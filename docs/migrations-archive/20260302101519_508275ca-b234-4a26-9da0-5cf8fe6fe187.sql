
CREATE OR REPLACE FUNCTION public.reset_reminder_on_reschedule()
RETURNS TRIGGER AS $$
BEGIN
  IF (OLD.session_date IS DISTINCT FROM NEW.session_date)
     OR (OLD.start_time IS DISTINCT FROM NEW.start_time) THEN
    NEW.reminder_sent_at := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER trg_reset_reminder_on_reschedule
  BEFORE UPDATE ON public.sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.reset_reminder_on_reschedule();

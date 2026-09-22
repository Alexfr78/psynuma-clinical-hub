import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { WebRecorderController, idleRecorderState, type RecorderState, type StartRecording } from '@/lib/web-recorder/controller';

interface WebRecorderContextValue {
  state: RecorderState;
  start: (input: StartRecording) => Promise<void>;
  pause: () => void;
  resume: () => void;
  finish: () => Promise<void>;
  recover: () => Promise<void>;
  discard: () => Promise<void>;
  dismiss: () => void;
}
const WebRecorderContext = createContext<WebRecorderContextValue | null>(null);

export function WebRecorderProvider({ children }: { children: ReactNode }) {
  const { user, profile, isAdmin, isProfessional, needsMfaVerification } = useAuth();
  const queryClient = useQueryClient();
  const controller = useRef<WebRecorderController | undefined>(undefined);
  const [state, setState] = useState<RecorderState>(idleRecorderState);
  const userId = user?.id;
  const centerId = profile?.center_id;
  const allowed = (isAdmin || isProfessional) && !needsMfaVerification;

  useEffect(() => {
    setState(idleRecorderState);
    if (!userId || !centerId || !allowed) return;
    const instance = new WebRecorderController(userId, centerId, setState, (sessionId, patientId) => {
      void queryClient.invalidateQueries({ queryKey: ['ai-documents', 'transcript-availability', sessionId] });
      void queryClient.invalidateQueries({ queryKey: ['ai-documents', 'session', sessionId] });
      void queryClient.invalidateQueries({ queryKey: ['ai-documents', 'patient', patientId] });
      void queryClient.invalidateQueries({ queryKey: ['sessions'] });
    });
    controller.current = instance;
    void instance.initialize();
    return () => { controller.current = undefined; instance.dispose(); };
  }, [userId, centerId, allowed, queryClient]);

  const current = () => {
    if (!controller.current) throw new Error('Inicia sesión como profesional para grabar.');
    return controller.current;
  };
  return <WebRecorderContext.Provider value={{ state,
    start: (input) => current().start(input), pause: () => current().pause(), resume: () => current().resume(),
    finish: () => current().finish(), recover: () => current().recover(), discard: () => current().discard(), dismiss: () => current().dismiss(),
  }}>{children}</WebRecorderContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useWebRecorder() {
  const value = useContext(WebRecorderContext);
  if (!value) throw new Error('WebRecorderProvider no está montado.');
  return value;
}

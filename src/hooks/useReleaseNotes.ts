import { qk } from '@/lib/query-keys';
import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { decideAnnouncement, parseReleaseNotes, unseenVersions, type ReleaseNotesPayload } from '@/lib/release-notes';

// Una pestaña abierta todo el día también se entera de lo que se publica.
const REFETCH_INTERVAL_MS = 10 * 60 * 1000;

export function useReleaseNotes() {
  const { user, profile } = useAuth();
  const queryClient = useQueryClient();
  const queryKey = qk.releaseNotes.byUser(user?.id);

  const query = useQuery({
    queryKey,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_release_notes', { p_limit: 20 });
      if (error) throw error;
      return parseReleaseNotes(data);
    },
    enabled: !!user?.id && !!profile?.center_id,
    refetchInterval: REFETCH_INTERVAL_MS,
    refetchOnWindowFocus: true,
    staleTime: 60 * 1000,
  });

  const markSeen = useMutation({
    mutationFn: async (until: string) => {
      const { error } = await supabase.rpc('mark_release_notes_seen', { p_until: until });
      if (error) throw error;
    },
    // Se marca al momento para que el punto y el aviso no reaparezcan mientras responde la base.
    onMutate: (until) => {
      queryClient.setQueryData<ReleaseNotesPayload>(queryKey, (prev) => {
        if (!prev) return prev;
        if (prev.seenAt && Date.parse(prev.seenAt) >= Date.parse(until)) return prev;
        return { ...prev, seenAt: until };
      });
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: qk.releaseNotes.all }),
  });

  const payload = query.data;
  const unseen = useMemo(() => (payload ? unseenVersions(payload) : []), [payload]);
  const announcement = useMemo(() => (payload ? decideAnnouncement(payload) : { kind: 'none' as const }), [payload]);

  return {
    versions: payload?.versions ?? [],
    unseen,
    announcement,
    isLoading: query.isLoading,
    markSeen: markSeen.mutate,
  };
}

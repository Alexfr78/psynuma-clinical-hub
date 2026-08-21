export type ZoomMeetingDetails = {
  meeting_id: string;
  join_url: string;
  password: string | null;
};

export async function createZoomMeetingForSession(args: {
  professionalId: string;
  sessionDate: string;
  startTime: string;
  endTime: string;
  topic: string;
  patientName: string;
}): Promise<ZoomMeetingDetails | null> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) return null;

  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/create-zoom-meeting`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceKey}`,
        apikey: serviceKey,
      },
      body: JSON.stringify({
        professional_id: args.professionalId,
        session_date: args.sessionDate,
        start_time: args.startTime,
        end_time: args.endTime,
        topic: args.topic,
        patient_name: args.patientName,
      }),
    });

    const data = await response.json();
    if (!response.ok || !data?.join_url || !data?.meeting_id) {
      console.error("[zoomMeeting] Could not create meeting:", data);
      return null;
    }

    return {
      meeting_id: String(data.meeting_id),
      join_url: data.join_url,
      password: data.password || null,
    };
  } catch (error) {
    console.error("[zoomMeeting] Error creating meeting:", error);
    return null;
  }
}

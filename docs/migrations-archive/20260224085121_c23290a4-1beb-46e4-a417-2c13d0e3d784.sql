UPDATE sessions
SET zoom_meeting_id = substring(video_call_link from '/j/([0-9]+)')
WHERE video_call_link LIKE '%zoom.us/j/%'
  AND zoom_meeting_id IS NULL;
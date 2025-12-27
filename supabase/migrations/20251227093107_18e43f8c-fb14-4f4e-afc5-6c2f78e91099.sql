-- Política para eliminar respuestas de evaluaciones del mismo centro
CREATE POLICY "Professionals can delete assessment responses from their center"
ON public.assessment_responses
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM assessments a
    JOIN profiles p ON p.center_id = a.center_id
    WHERE a.id = assessment_responses.assessment_id
    AND p.id = auth.uid()
  )
);

-- Política para eliminar evaluaciones del mismo centro
CREATE POLICY "Professionals can delete assessments from their center"
ON public.assessments
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.center_id = assessments.center_id
    AND p.id = auth.uid()
  )
);
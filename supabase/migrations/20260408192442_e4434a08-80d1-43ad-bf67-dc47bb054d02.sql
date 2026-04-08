
CREATE TABLE public.saved_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  source_project_id TEXT,
  source_project_name TEXT,
  plan_json JSONB NOT NULL,
  extracted_design_json JSONB,
  zip_storage_path TEXT,
  ai_critique TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.saved_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view saved templates"
ON public.saved_templates FOR SELECT USING (true);

CREATE POLICY "Anyone can create saved templates"
ON public.saved_templates FOR INSERT WITH CHECK (true);

CREATE POLICY "Anyone can update saved templates"
ON public.saved_templates FOR UPDATE USING (true);

CREATE POLICY "Anyone can delete saved templates"
ON public.saved_templates FOR DELETE USING (true);

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_saved_templates_updated_at
BEFORE UPDATE ON public.saved_templates
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

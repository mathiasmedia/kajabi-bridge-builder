ALTER TABLE public.saved_templates
ADD COLUMN reference_images jsonb DEFAULT '[]'::jsonb;
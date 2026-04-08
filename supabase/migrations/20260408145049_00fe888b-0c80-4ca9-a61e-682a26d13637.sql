INSERT INTO storage.buckets (id, name, public)
VALUES ('theme-assets', 'theme-assets', true);

CREATE POLICY "Theme assets are publicly accessible"
ON storage.objects
FOR SELECT
USING (bucket_id = 'theme-assets');

CREATE POLICY "Authenticated users can upload theme assets"
ON storage.objects
FOR INSERT
WITH CHECK (bucket_id = 'theme-assets' AND auth.role() = 'authenticated');
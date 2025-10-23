-- Fix Storage Bucket Issues
-- Run this script manually in your Supabase SQL editor

-- Create the storage bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'quiz-files',
  'quiz-files',
  false,
  52428800,  -- 50MB limit
  ARRAY[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- Enable RLS for storage objects
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can upload quiz documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can read quiz documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can update quiz documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete quiz documents" ON storage.objects;

-- Create storage policies
CREATE POLICY "Users can upload quiz documents"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'quiz-files' 
  AND auth.role() = 'authenticated'
);

CREATE POLICY "Users can read quiz documents"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'quiz-files' 
  AND auth.role() = 'authenticated'
);

CREATE POLICY "Users can update quiz documents"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'quiz-files' 
  AND auth.role() = 'authenticated'
);

CREATE POLICY "Users can delete quiz documents"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'quiz-files' 
  AND auth.role() = 'authenticated'
);

-- Create the RPC function
CREATE OR REPLACE FUNCTION create_quiz_docs_bucket()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Insert bucket if it doesn't exist
  INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  VALUES (
    'quiz-files',
    'quiz-files',
    false,
    52428800,  -- 50MB limit
    ARRAY[
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain'
    ]
  )
  ON CONFLICT (id) DO NOTHING;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION create_quiz_docs_bucket() TO authenticated;
GRANT EXECUTE ON FUNCTION create_quiz_docs_bucket() TO anon;

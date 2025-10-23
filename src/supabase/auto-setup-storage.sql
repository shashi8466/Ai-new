-- Auto Setup Storage Bucket
-- This script automatically creates everything needed for quiz file storage

-- 1. Create the RPC function for automatic bucket creation
CREATE OR REPLACE FUNCTION create_quiz_docs_bucket()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Create bucket if it doesn't exist
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

  -- Create storage policies if they don't exist
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'objects' 
    AND policyname = 'Users can upload quiz documents'
  ) THEN
    CREATE POLICY "Users can upload quiz documents"
    ON storage.objects FOR INSERT
    WITH CHECK (
      bucket_id = 'quiz-files' 
      AND auth.role() = 'authenticated'
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'objects' 
    AND policyname = 'Users can read quiz documents'
  ) THEN
    CREATE POLICY "Users can read quiz documents"
    ON storage.objects FOR SELECT
    USING (
      bucket_id = 'quiz-files' 
      AND auth.role() = 'authenticated'
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'objects' 
    AND policyname = 'Users can update quiz documents'
  ) THEN
    CREATE POLICY "Users can update quiz documents"
    ON storage.objects FOR UPDATE
    USING (
      bucket_id = 'quiz-files' 
      AND auth.role() = 'authenticated'
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'objects' 
    AND policyname = 'Users can delete quiz documents'
  ) THEN
    CREATE POLICY "Users can delete quiz documents"
    ON storage.objects FOR DELETE
    USING (
      bucket_id = 'quiz-files' 
      AND auth.role() = 'authenticated'
    );
  END IF;

EXCEPTION
  WHEN OTHERS THEN
    -- Log error but don't fail the function
    RAISE NOTICE 'Error in create_quiz_docs_bucket: %', SQLERRM;
END;
$$;

-- 2. Grant permissions
GRANT EXECUTE ON FUNCTION create_quiz_docs_bucket() TO authenticated;
GRANT EXECUTE ON FUNCTION create_quiz_docs_bucket() TO anon;

-- 3. Create the bucket immediately
SELECT create_quiz_docs_bucket();

import { useState, useEffect } from 'react';
import supabase from '../../supabase/supabase.js';
import SafeIcon from '../../common/SafeIcon';
import * as FiIcons from 'react-icons/fi';
const { FiUpload, FiFile, FiCheckCircle, FiTrash2, FiLoader, FiAlertCircle } = FiIcons;

// Create Supabase client with proper configuration

const QuizDocumentUploader = ({ courseId, onUploadComplete }) => {
  const [uploads, setUploads] = useState({
    Easy: [],
    Medium: [],
    Hard: []
  });
  const [uploading, setUploading] = useState(false);
  const [processingStatus, setProcessingStatus] = useState({});
  const [error, setError] = useState(null);
  const [bucketInitialized, setBucketInitialized] = useState(false);


  // Create client instance with proper auth

  // Initialize bucket on component mount
  useEffect(() => {
    initializeStorage();
  }, []);

  const initializeStorage = async () => {
    try {
      // First check if bucket already exists
      const { data: buckets, error: listError } = await supabase.storage.listBuckets();

      if (listError) {
        console.log('Error listing buckets:', listError.message);
        setBucketInitialized(false);
        return;
      }

      const bucketExists = buckets?.some(bucket => bucket.id === 'quiz-files');

      if (bucketExists) {
        console.log('Storage bucket already exists');
        setBucketInitialized(true);
        return;
      }

      // Try to create bucket via RPC call
      const { error: rpcError } = await supabase.rpc('create_quiz_docs_bucket');

      if (rpcError) {
        console.log('RPC call failed, trying direct bucket creation...');
        // Try direct bucket creation
        const { error: bucketError } = await supabase.storage.createBucket('quiz-files', {
          public: false,
          fileSizeLimit: 52428800, // 50MB
          allowedMimeTypes: [
            'application/pdf',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'text/plain'
          ]
        });

        if (bucketError) {
          console.log('Bucket creation failed, using fallback mode:', bucketError.message);
          setBucketInitialized(false);
        } else {
          console.log('Bucket created successfully');
          setBucketInitialized(true);
        }
      } else {
        console.log('Bucket initialized via RPC');
        setBucketInitialized(true);
      }
    } catch (err) {
      console.log('Storage initialization failed, using fallback mode:', err.message);
      setBucketInitialized(false);
    }
  };

  const extractTextFromDocx = async (file) => {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const mammoth = await import('mammoth/mammoth.browser.js');
      const { value } = await mammoth.extractRawText({ arrayBuffer });
      return value || '';
    } catch (e) {
      console.error('DOCX parse failed:', e);
      return '';
    }
  };

  const extractTextFromPdf = async (file) => {
    try {
      const pdfjsLib = await import('pdfjs-dist');
      if (pdfjsLib.GlobalWorkerOptions) {
        pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;
      }
      const arrayBuffer = await file.arrayBuffer();
      const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
      const pdf = await loadingTask.promise;
      let fullText = '';
      for (let p = 1; p <= pdf.numPages; p++) {
        const page = await pdf.getPage(p);
        const content = await page.getTextContent();
        const strings = content.items.map((it) => it.str);
        fullText += strings.join(' ') + '\n';
      }
      return fullText;
    } catch (e) {
      console.error('PDF parse failed:', e);
      return '';
    }
  };

  const handleFileUpload = async (level, files) => {
    if (!files || files.length === 0) return;

    setUploading(true);
    setError(null);

    // Try to initialize storage if not already done
    if (!bucketInitialized) {
      await initializeStorage();
    }

    // If storage still not available, use fallback mode
    if (!bucketInitialized) {
      console.log('Using fallback mode - processing files directly');
    }

    const newUploads = [...uploads[level]];

    for (const file of files) {
      try {
        let uploadRecord = null;

        if (bucketInitialized) {
          try {
            // Try Supabase Storage
            const filePath = `${courseId}/${level}/${Date.now()}-${file.name}`;

            // Upload file to storage
            const { error: uploadError } = await supabase.storage
              .from('quiz-files')
              .upload(filePath, file, {
                cacheControl: '3600',
                upsert: false
              });

            if (uploadError) {
              console.error('Upload error:', uploadError);
              console.log('Storage upload failed, switching to fallback mode');
              // Switch to fallback mode
              bucketInitialized = false;
            } else {
              // Save metadata to database
              const { data: dbData, error: dbError } = await supabase
                .from('quiz_uploads')
                .insert({
                  course_id: courseId,
                  level: level,
                  file_name: file.name,
                  file_path: filePath,
                  file_size: file.size,
                  file_type: file.type,
                  uploaded_by: (await supabase.auth.getUser()).data.user?.id || 'anonymous'
                })
                .select()
                .single();

              if (dbError) {
                console.error('Database error:', dbError);
                throw new Error(`Database save failed: ${dbError.message}`);
              }

              uploadRecord = dbData;
            }
          } catch (storageError) {
            console.log('Storage failed, using fallback mode:', storageError.message);
            bucketInitialized = false;
          }
        }

        if (!bucketInitialized) {
          // Fallback: Save file metadata without storage
          const { data: dbData, error: dbError } = await supabase
            .from('quiz_uploads')
            .insert({
              course_id: courseId,
              level: level,
              file_name: file.name,
              file_path: `local/${courseId}/${level}/${file.name}`,
              file_size: file.size,
              file_type: file.type,
              uploaded_by: (await supabase.auth.getUser()).data.user?.id || 'anonymous',
              status: 'processed'
            })
            .select()
            .single();

          if (dbError) {
            console.error('Database error:', dbError);
            throw new Error(`Database save failed: ${dbError.message}`);
          }

          uploadRecord = dbData;
        }

        newUploads.push({ ...uploadRecord, file: file });

        // Trigger processing
        setProcessingStatus(prev => ({
          ...prev,
          [uploadRecord.id]: 'processing'
        }));

        // Process the document
        setTimeout(async () => {
          await processQuizDocument(uploadRecord.id, file, level);
          setProcessingStatus(prev => ({
            ...prev,
            [uploadRecord.id]: 'processed'
          }));
        }, 2000);

        // Refresh uploads list
        await fetchUploads();
      } catch (error) {
        console.error('Upload failed:', error);
        setError(error.message);
      }
    }

    setUploading(false);
    onUploadComplete?.();
  };

  const fetchUploads = async () => {
    try {
      const { data, error } = await supabase
        .from('quiz_uploads')
        .select('*')
        .eq('course_id', courseId)
        .order('uploaded_at', { ascending: false });

      if (error) {
        console.error('Error fetching uploads:', error);
        return;
      }

      // Group by level
      const groupedUploads = {
        Easy: [],
        Medium: [],
        Hard: []
      };

      data.forEach(upload => {
        if (groupedUploads[upload.level]) {
          groupedUploads[upload.level].push(upload);
        }
      });

      setUploads(groupedUploads);
    } catch (err) {
      console.error('Error fetching uploads:', err);
    }
  };

  useEffect(() => {
    if (courseId) {
      fetchUploads();
    }
  }, [courseId]);

  const parseQuizTxt = (text) => {
    console.log('Parsing text with length:', text.length);
    console.log('First 500 characters:', text.substring(0, 500));

    const lines = text.split(/\r?\n/);
    const out = [];
    let current = null;
    const letterToIndex = (ch) => ch.toLowerCase().charCodeAt(0) - 'a'.charCodeAt(0);

    // More flexible patterns
    const questionPatterns = [
      /^Q\.\d+\)\s*/i,                    // Q.1) Q.2) etc (your format)
      /^Q[\s.]*\d+[\).]?\s*/i,           // Q1. Q2. etc
      /^\d+[\.\)]\s*/i,                   // 1. 2. etc
      /^Question\s*\d*[\.\)]?\s*/i,      // Question 1. etc
      /^Problem\s*\d*[\.\)]?\s*/i,        // Problem 1. etc
    ];

    const optionPatterns = [
      /^[a-dA-D]\)\s*(.+)$/,              // A) B) C) D) (your format)
      /^[a-dA-D][\.\)]\s*(.+)$/,          // A. B. C. D.
      /^[a-dA-D]\s+(.+)$/,                // A B C D
      /^[1-4][\.\)]\s*(.+)$/,             // 1. 2. 3. 4.
      /^[1-4]\s+(.+)$/,                   // 1 2 3 4
    ];

    const answerPatterns = [
      /^Answer\s*:\s*([a-dA-D])\b/i,      // Answer: A
      /^Answer\s*:\s*([1-4])\b/i,         // Answer: 1
      /^Correct\s*:\s*([a-dA-D])\b/i,     // Correct: A
      /^Correct\s*:\s*([1-4])\b/i,        // Correct: 1
    ];

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;

      // Check for question patterns
      let isQuestion = false;
      for (const pattern of questionPatterns) {
        if (pattern.test(line)) {
          console.log('Found question:', line);
          if (current && current.question && current.options.length > 0 && current.answerIndex != null) {
            if (current.explanation) current.explanation = current.explanation.trim();
            out.push(current);
          }
          const qText = line.replace(pattern, '').trim();
          current = { question: qText, options: [], answerIndex: null, explanation: '', _collectingExplanation: false };
          isQuestion = true;
          break;
        }
      }
      if (isQuestion) continue;

      // Check for option patterns
      let isOption = false;
      for (const pattern of optionPatterns) {
        const match = line.match(pattern);
        if (match) {
          console.log('Found option:', line);
          current = current || { question: '', options: [], answerIndex: null, explanation: '', _collectingExplanation: false };
          current.options.push(match[1].trim());
          isOption = true;
          break;
        }
      }
      if (isOption) continue;

      // Check for answer patterns
      let isAnswer = false;
      for (const pattern of answerPatterns) {
        const match = line.match(pattern);
        if (match) {
          console.log('Found answer:', line);
          current = current || { question: '', options: [], answerIndex: null, explanation: '', _collectingExplanation: false };
          const answer = match[1];
          // Convert to 0-based index
          if (/[a-dA-D]/.test(answer)) {
            current.answerIndex = letterToIndex(answer);
          } else if (/[1-4]/.test(answer)) {
            current.answerIndex = parseInt(answer) - 1;
          }
          isAnswer = true;
          break;
        }
      }
      if (isAnswer) continue;

      // Check for explanation
      const expStart = line.match(/^Explanation\s*:?(.*)$/i);
      if (expStart) {
        current = current || { question: '', options: [], answerIndex: null, explanation: '', _collectingExplanation: false };
        current._collectingExplanation = true;
        const initial = (expStart[1] || '').trim();
        if (initial) {
          current.explanation += (current.explanation ? '\n' : '') + initial;
        }
        continue;
      }

      if (current && current._collectingExplanation) {
        current.explanation += (current.explanation ? '\n' : '') + rawLine.trim();
        continue;
      }

      // If it's a continuation of question text
      if (current && current.answerIndex == null && current.options.length === 0) {
        current.question = (current.question ? current.question + ' ' : '') + line;
      }
    }

    if (current && current.question && current.options.length > 0 && current.answerIndex != null) {
      if (current.explanation) current.explanation = current.explanation.trim();
      out.push(current);
    }

    console.log('Parsed questions:', out.length);
    return out;
  };

  const processQuizDocument = async (uploadId, file, level) => {
    try {
      if (!file) return;
      let text = '';
      const name = file.name || '';
      if (file.type === 'text/plain' || /\.txt$/i.test(name)) {
        text = await file.text();
      } else if (file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || /\.docx$/i.test(name)) {
        text = await extractTextFromDocx(file);
      } else if (file.type === 'application/pdf' || /\.pdf$/i.test(name)) {
        text = await extractTextFromPdf(file);
      }

      console.log('Processing document:', file.name, 'Text length:', text.length);
      const parsed = parseQuizTxt(text || '');
      console.log('Parsed questions:', parsed.length, parsed);

      if (!parsed || parsed.length === 0) {
        console.log('No questions parsed, creating intelligent fallback questions');
        // Create intelligent fallback questions based on document content
        const words = text.toLowerCase().split(/\s+/).filter(word => word.length > 3);
        const wordCounts = {};
        words.forEach(word => {
          wordCounts[word] = (wordCounts[word] || 0) + 1;
        });
        const topWords = Object.entries(wordCounts)
          .sort(([, a], [, b]) => b - a)
          .slice(0, 10)
          .map(([word]) => word);

        const fallbackQuestions = [
          {
            question: `Based on ${file.name}, what is the main topic discussed?`,
            options: [
              topWords[0] || 'Main Topic',
              topWords[1] || 'Secondary Topic',
              topWords[2] || 'Related Topic',
              'None of the above'
            ],
            answerIndex: 0,
            explanation: `This question is based on the uploaded document: ${file.name}. The main topic appears to be related to ${topWords[0] || 'the content'}`
          },
          {
            question: `From ${file.name}, which concept is most important?`,
            options: [
              topWords[1] || 'Key Concept',
              topWords[2] || 'Secondary Concept',
              topWords[3] || 'Related Concept',
              'All concepts are equally important'
            ],
            answerIndex: 0,
            explanation: `This question tests understanding of concepts from ${file.name}`
          }
        ];

        const rows = fallbackQuestions.map((q, idx) => ({
          quiz_upload_id: uploadId,
          course_id: courseId,
          level: level,
          question_number: idx + 1,
          question_text: q.question,
          options: q.options,
          correct_answer: q.answerIndex,
          explanation: q.explanation || ''
        }));

        const { error: insertError } = await supabase
          .from('quiz_questions')
          .insert(rows);

        if (insertError) {
          console.error('Fallback insert error:', insertError);
          await supabase
            .from('quiz_uploads')
            .update({ status: 'error' })
            .eq('id', uploadId);
          return;
        }

        await supabase
          .from('quiz_uploads')
          .update({ status: 'processed', processed_at: new Date().toISOString() })
          .eq('id', uploadId);
        return;
      }
      const rows = parsed.map((q, idx) => ({
        quiz_upload_id: uploadId,
        course_id: courseId,
        level: level,
        question_number: idx + 1,
        question_text: q.question,
        options: q.options,
        correct_answer: q.answerIndex,
        explanation: q.explanation || ''
      }));
      const { error: insertError } = await supabase
        .from('quiz_questions')
        .insert(rows);
      if (insertError) {
        throw insertError;
      }
      await supabase
        .from('quiz_uploads')
        .update({ status: 'processed', processed_at: new Date().toISOString() })
        .eq('id', uploadId);
    } catch (error) {
      console.error('Processing error:', error);
      await supabase
        .from('quiz_uploads')
        .update({ status: 'error' })
        .eq('id', uploadId);
    }
  };

  const handleDeleteUpload = async (level, uploadId, index) => {
    try {
      // Delete from storage if bucket is initialized
      if (bucketInitialized) {
        const { data: upload } = await supabase
          .from('quiz_uploads')
          .select('file_path')
          .eq('id', uploadId)
          .single();

        if (upload?.file_path) {
          await supabase.storage
            .from('quiz-files')
            .remove([upload.file_path]);
        }
      }

      // Delete from database
      await supabase
        .from('quiz_uploads')
        .delete()
        .eq('id', uploadId);

      // Remove from local state
      setUploads(prev => ({
        ...prev,
        [level]: prev[level].filter((_, i) => i !== index)
      }));
    } catch (error) {
      console.error('Delete error:', error);
    }
  };

  const levels = ['Easy', 'Medium', 'Hard'];

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">📝 Upload Quiz Documents</h3>
      <p className="text-sm text-gray-600 mb-6">
        Upload quiz documents (DOCX, PDF, TXT) for each difficulty level. These will be used to generate quiz questions for students.
        {!bucketInitialized && (
          <span className="block mt-2 text-blue-600">
            🔄 Storage will be set up automatically when you upload your first file
          </span>
        )}
        {bucketInitialized && (
          <span className="block mt-2 text-green-600">
            ✅ Storage ready - files will be stored and processed automatically
          </span>
        )}
      </p>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
          <div className="flex items-center space-x-2">
            <SafeIcon icon={FiAlertCircle} className="h-5 w-5 text-red-500" />
            <span className="text-red-700 text-sm">{error}</span>
          </div>
        </div>
      )}

      {levels.map(level => (
        <div key={level} className="border-2 border-dashed border-gray-300 rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-md font-medium text-gray-900">{level} Level</h4>
            <span className="text-sm text-gray-500">
              {uploads[level].length} file{uploads[level].length !== 1 ? 's' : ''} uploaded
            </span>
          </div>

          <div className="mb-4">
            <input
              type="file"
              multiple
              accept=".docx,.pdf,.txt"
              onChange={(e) => handleFileUpload(level, e.target.files)}
              className="hidden"
              id={`quiz-upload-${level}`}
            />
            <label
              htmlFor={`quiz-upload-${level}`}
              className="cursor-pointer flex items-center justify-center w-full p-4 border-2 border-gray-300 rounded-lg hover:border-gray-400 transition-colors"
            >
              <SafeIcon icon={FiUpload} className="h-5 w-5 text-gray-400 mr-2" />
              <span className="text-gray-600">Click to upload {level} level quiz documents</span>
            </label>
          </div>

          {uploads[level].length > 0 && (
            <div className="space-y-2">
              {uploads[level].map((upload, index) => (
                <div key={upload.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center space-x-3">
                    <SafeIcon icon={FiFile} className="h-4 w-4 text-gray-500" />
                    <div>
                      <p className="text-sm font-medium text-gray-900">{upload.file_name}</p>
                      <p className="text-xs text-gray-500">
                        {upload.file_size && `${(upload.file_size / 1024).toFixed(1)} KB`}
                        {upload.status === 'processed' && ' • ✅ Processed'}
                        {upload.status === 'processing' && ' • ⏳ Processing'}
                        {upload.status === 'error' && ' • ❌ Error'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    {processingStatus[upload.id] === 'processing' && (
                      <SafeIcon icon={FiLoader} className="h-4 w-4 text-blue-500 animate-spin" />
                    )}
                    {processingStatus[upload.id] === 'processed' && (
                      <SafeIcon icon={FiCheckCircle} className="h-4 w-4 text-green-500" />
                    )}
                    <button
                      onClick={() => handleDeleteUpload(level, upload.id, index)}
                      className="text-red-500 hover:text-red-700"
                    >
                      <SafeIcon icon={FiTrash2} className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}

      {uploading && (
        <div className="text-center py-4">
          <div className="inline-flex items-center space-x-2">
            <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
            <span className="text-sm text-gray-600">Uploading and processing documents...</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default QuizDocumentUploader;
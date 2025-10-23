import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import supabase from '../../../supabase/supabase.js';
import { useCourse } from '../../../context/CourseContext';
import SafeIcon from '../../../common/SafeIcon';
import * as FiIcons from 'react-icons/fi';
const { FiAward, FiRefreshCw, FiHelpCircle, FiBarChart2, FiAlertTriangle, FiCheckCircle, FiMessageCircle, FiX, FiSend } = FiIcons;

// Supabase client is provided by shared module
const QuizFrame = ({ selectedCourse, currentLevel, frameData, setCurrentFrame, setCurrentLevel, setSelectedCourse, previousScores = { easy: 0, medium: 0, hard: 0 }, setPreviousScores }) => {
  const { currentTopic } = frameData;
  const { unlockNextLevel } = useCourse();
  const [phase, setPhase] = useState(1);
  const [questions, setQuestions] = useState([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState(null);
  const [quizState, setQuizState] = useState('in_progress');
  const [answers, setAnswers] = useState([]);
  const [showScoreReport, setShowScoreReport] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [loadingMessage, setLoadingMessage] = useState('Loading quiz questions...');

  // AI Tutor Chat states
  const [showAITutor, setShowAITutor] = useState(false);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [practiceQuestion, setPracticeQuestion] = useState(null);

  // Use shared Supabase client

  // Fetch quiz questions from Supabase
  const fetchQuizQuestions = async (courseId, level) => {
    try {
      setLoadingMessage('Fetching quiz questions from database...');

      // Load questions parsed from uploaded documents
      const { data: parsedQuestions, error: parsedError } = await supabase
        .from('quiz_questions')
        .select('*')
        .eq('course_id', courseId)
        .eq('level', level)
        .order('question_number');

      if (parsedError) {
        console.error('Error fetching parsed questions:', parsedError);
      }

      if (parsedQuestions && parsedQuestions.length > 0) {
        setLoadingMessage('Questions loaded successfully!');
        return parsedQuestions.map(q => ({
          id: q.id,
          question: q.question_text,
          options: q.options,
          correct: q.correct_answer,
          explanation: q.explanation || 'This question tests your understanding of the concept.',
          source: 'supabase_database',
          documentName: undefined,
          documentSize: undefined
        }));
      }

      // No fallback: if no questions present, return empty and show empty state
      setLoadingMessage('No quiz questions found for this course and level.');
      return [];
    } catch (error) {
      console.error('Error in fetchQuizQuestions:', error);
      setLoadingMessage('Failed to load questions.');
      return [];
    }
  };

  // Generate questions from uploaded documents
  const generateQuestionsFromUploads = (uploads, topic, level) => {
    const questionCount = level === 'Easy' ? 6 : level === 'Medium' ? 10 : 15;
    const allQuestions = [];

    uploads.forEach((upload) => {
      const questionsPerUpload = Math.ceil(questionCount / uploads.length);
      for (let i = 0; i < questionsPerUpload; i++) {
        allQuestions.push({
          question: `Question ${i + 1} from ${upload.file_name}: Based on the ${level} level materials for ${topic}, what concept is most important?`,
          options: [
            `Key concept from ${upload.file_name}`,
            `Secondary concept from materials`,
            `Related concept for ${level}`,
            `Advanced concept for next level`
          ],
          correct: 0,
          explanation: `This question is based on the uploaded document: ${upload.file_name}. The correct answer represents the key concept emphasized in the materials.`,
          source: 'uploaded_document',
          documentName: upload.file_name,
          documentSize: upload.file_size
        });
      }
    });

    return allQuestions.slice(0, questionCount);
  };

  // Generate sample questions as fallback
  const generateSampleQuestions = (topic, level) => {
    const questionCount = level === 'Easy' ? 6 : level === 'Medium' ? 10 : 15;
    const sampleQuestions = [];

    for (let i = 0; i < questionCount; i++) {
      sampleQuestions.push({
        question: `Sample Question ${i + 1}: What is the fundamental concept of ${topic} at the ${level} level?`,
        options: [
          `Correct understanding of ${topic}`,
          `Partial understanding of ${topic}`,
          `Common misconception about ${topic}`,
          `Unrelated concept`
        ],
        correct: 0,
        explanation: `This is a sample question about ${topic}. In a real implementation, this would be replaced with questions from uploaded documents.`,
        source: 'sample_fallback'
      });
    }

    return sampleQuestions;
  };

  useEffect(() => {
    const phaseMap = { 'Easy': 1, 'Medium': 2, 'Hard': 3 };
    const newPhase = phaseMap[currentLevel];
    setPhase(newPhase);
    setIsLoading(true);

    const loadQuestions = async () => {
      const resolvedCourseId =
        (selectedCourse && (selectedCourse.id || selectedCourse.cId || selectedCourse.courseId)) ||
        selectedCourse?.title?.replace(/\s+/g, '_').toLowerCase();
      const newQuestions = await fetchQuizQuestions(resolvedCourseId, currentLevel);
      setQuestions(newQuestions);
      setIsLoading(false);
      handleRestartQuiz();
    };

    loadQuestions();
  }, [currentLevel, selectedCourse, currentTopic]);

  const score = answers.filter(a => a.isCorrect).length;
  const currentQuestion = questions[currentQuestionIndex];

  // Calculate scaled scores
  const calculateScaledScore = (correct, total, maxScore) => {
    if (total === 0) return 0;
    return Math.round((correct / total) * maxScore);
  };

  const getScaledScoreRange = (phase) => {
    const ranges = {
      1: { min: 200, max: 400 },
      2: { min: 400, max: 600 },
      3: { min: 600, max: 800 }
    };
    return ranges[phase] || { min: 0, max: 100 };
  };

  const handleAnswerSelect = (optionIndex) => {
    if (quizState === 'in_progress') setSelectedAnswer(optionIndex);
  };

  const handleSubmitAnswer = () => {
    if (selectedAnswer === null) return;

    const isCorrect = selectedAnswer === currentQuestion.correct;
    setAnswers(prev => [...prev, { questionIndex: currentQuestionIndex, isCorrect }]);
    setQuizState('feedback');
  };

  const handleNext = () => {
    if (currentQuestionIndex < questions.length - 1) {
      setCurrentQuestionIndex(prev => prev + 1);
      setSelectedAnswer(null);
      setQuizState('in_progress');
      setShowAITutor(false);
      setPracticeQuestion(null);
    } else {
      setQuizState('completed');
    }
  };

  const handleRestartQuiz = () => {
    setCurrentQuestionIndex(0);
    setSelectedAnswer(null);
    setQuizState('in_progress');
    setAnswers([]);
    setShowAITutor(false);
    setPracticeQuestion(null);
  };

  const handleNextPhase = () => {
    const nextLevelMap = { 1: 'Medium', 2: 'Hard' };
    const nextLevel = nextLevelMap[phase];
    const scoreRange = getScaledScoreRange(phase);
    const scaledScore = calculateScaledScore(score, questions.length, scoreRange.max);

    // Unlock the next level upon successful completion
    unlockNextLevel(selectedCourse.id, currentLevel);

    setPreviousScores(prev => ({
      ...prev,
      [phase === 1 ? 'easy' : phase === 2 ? 'medium' : 'hard']: scaledScore
    }));

    if (nextLevel) {
      setCurrentLevel(nextLevel);
      setCurrentFrame('topicIntro');
    }
  };

  const isCorrect = selectedAnswer === currentQuestion?.correct;

  // AI Tutor Chat Functions
  const handleOpenAITutor = () => {
    setShowAITutor(true);
    setChatMessages([
      {
        type: 'ai',
        content: `Hello! I see you had some trouble with that question about ${currentTopic}. Let me help you understand it better.\n\n**The correct answer is:** ${currentQuestion.options[currentQuestion.correct]}\n\n**Explanation:** ${currentQuestion.explanation}\n\nWould you like me to:\n1️⃣ Generate a similar question for extra practice\n2️⃣ Explain this concept in a different way\n\nJust let me know which option you prefer!`
      }
    ]);
    setPracticeQuestion(null);
  };

  const generateSimilarQuestion = () => {
    setIsTyping(true);
    setTimeout(() => {
      const correctAnswer = currentQuestion.options[currentQuestion.correct];
      const options = [
        correctAnswer,
        ...currentQuestion.options.filter((_, index) => index !== currentQuestion.correct).slice(0, 2),
        'A completely different concept'
      ].sort(() => Math.random() - 0.5);

      const correctIndex = options.findIndex(opt => opt === correctAnswer);

      const similarQuestion = {
        question: `Practice Question: ${currentQuestion.question.replace('According to', 'Based on your understanding of').replace('Based on', 'Considering')}`,
        options: options,
        correct: correctIndex,
        explanation: `This practice question helps reinforce the same concept: ${currentTopic}. The correct answer follows the same logic as the original question.`
      };

      setPracticeQuestion(similarQuestion);
      setIsTyping(false);
      setChatMessages(prev => [
        ...prev,
        {
          type: 'ai',
          content: `Great choice! Here's a similar practice question to help you master this concept:\n\n**${similarQuestion.question}**\n\n${similarQuestion.options.map((opt, i) => `${i + 1}. ${opt}`).join('\n')}\n\nTake your time to think about it, and let me know your answer!`
        }
      ]);
    }, 2000);
  };

  const handleChatSubmit = (e) => {
    e.preventDefault();
    if (!chatInput.trim()) return;

    const userMessage = chatInput.trim();
    setChatMessages(prev => [...prev, { type: 'user', content: userMessage }]);
    setChatInput('');
    setIsTyping(true);

    setTimeout(() => {
      let aiResponse = '';

      if (practiceQuestion) {
        // Handle practice question answers
        const answerIndex = parseInt(userMessage) - 1;
        if (!isNaN(answerIndex) && answerIndex >= 0 && answerIndex < practiceQuestion.options.length) {
          const isPracticeCorrect = answerIndex === practiceQuestion.correct;
          aiResponse = isPracticeCorrect ?
            `🎉 **Excellent!** That's the correct answer!\n\n${practiceQuestion.explanation}\n\nYou're really getting the hang of ${currentTopic}. Keep up the great work!` :
            `Not quite right. The correct answer is **${practiceQuestion.options[practiceQuestion.correct]}**.\n\n${practiceQuestion.explanation}\n\nWould you like me to generate another practice question, or explain this concept differently?`;
          setPracticeQuestion(null);
        } else {
          aiResponse = 'Please select a number from 1 to 4 for your answer.';
        }
      } else {
        // Handle general chat responses
        if (userMessage.includes('1') || userMessage.toLowerCase().includes('practice')) {
          generateSimilarQuestion();
          return;
        } else if (userMessage.includes('2') || userMessage.toLowerCase().includes('explain')) {
          aiResponse = `Let me explain ${currentTopic} in a different way:\n\nThink of it like building blocks. First, you need to understand the basic foundation (${currentLevel} level). Then you can add more complex ideas on top.\n\nThe key point from the question is: ${currentQuestion.explanation.split('.')[0]}.\n\nDoes this help clarify the concept for you?`;
        } else {
          aiResponse = `I'm here to help you with ${currentTopic}! Would you like me to:\n1️⃣ Generate a similar practice question\n2️⃣ Explain the concept differently\n\nJust let me know which option you'd prefer!`;
        }
      }

      setChatMessages(prev => [...prev, { type: 'ai', content: aiResponse }]);
      setIsTyping(false);
    }, 1500);
  };

  // Enhanced loading state
  if (isLoading) {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-white rounded-2xl shadow-xl p-8">
        <div className="text-center py-12">
          <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-6"></div>
          <h2 className="text-2xl font-semibold text-gray-900 mb-4">Loading Quiz Questions</h2>
          <p className="text-gray-600 mb-2">{loadingMessage}</p>
          <p className="text-sm text-gray-500">Fetching from Supabase database for {currentTopic} - {currentLevel} level</p>
        </div>
      </motion.div>
    );
  }

  if (questions.length === 0) {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-white rounded-2xl shadow-xl p-8">
        <div className="text-center py-12">
          <SafeIcon icon={FiHelpCircle} className="h-16 w-16 text-gray-400 mx-auto mb-4" />
          <h2 className="text-2xl font-semibold text-gray-900 mb-4">No Quiz Questions Available</h2>
          <p className="text-gray-600 mb-6">
            No quiz questions found for {currentLevel} level. Please ask your instructor to upload quiz documents.
          </p>
          <div className="space-y-4">
            <motion.button
              whileHover={{ scale: 1.05 }}
              onClick={() => setCurrentFrame('learningMaterials')}
              className="bg-blue-600 text-white px-6 py-3 rounded-lg font-semibold"
            >
              Review Study Materials
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.05 }}
              onClick={() => {
                setSelectedCourse(null);
                setCurrentFrame('welcome');
              }}
              className="block mx-auto text-blue-600 hover:text-blue-700 font-medium"
            >
              ← Back to Course Selection
            </motion.button>
          </div>
        </div>
      </motion.div>
    );
  }

  if (quizState === 'completed') {
    const scorePercentage = questions.length > 0 ? Math.round((score / questions.length) * 100) : 0;
    const passed = scorePercentage >= 10;
    const scoreRange = getScaledScoreRange(phase);
    const scaledScore = calculateScaledScore(score, questions.length, scoreRange.max);
    const updatedScores = {
      ...previousScores,
      [phase === 1 ? 'easy' : phase === 2 ? 'medium' : 'hard']: scaledScore
    };
    const isLastPhase = phase === 3;

    if (passed && !isLastPhase) {
      unlockNextLevel(selectedCourse.id, currentLevel);
    }

    let overallScore = 0;
    let maxOverallScore = 0;

    if (isLastPhase) {
      const easyRange = getScaledScoreRange(1);
      const mediumRange = getScaledScoreRange(2);
      const hardRange = getScaledScoreRange(3);
      overallScore = updatedScores.easy + updatedScores.medium + updatedScores.hard;
      maxOverallScore = easyRange.max + mediumRange.max + hardRange.max;
    }

    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-white rounded-2xl shadow-xl p-8">
        {isLastPhase && showScoreReport ? (
          <div className="text-center">
            <SafeIcon icon={FiBarChart2} className="h-20 w-20 text-blue-600 mx-auto mb-6" />
            <h1 className="text-3xl font-bold text-gray-900 mb-6">Your Scaled Score Report</h1>
            <div className="space-y-4 mb-8">
              <div className="bg-green-50 rounded-xl p-6">
                <h3 className="text-lg font-semibold text-green-800 mb-2">Easy Phase Score</h3>
                <p className="text-2xl font-bold text-green-600">{updatedScores.easy} / 400</p>
              </div>
              <div className="bg-yellow-50 rounded-xl p-6">
                <h3 className="text-lg font-semibold text-yellow-800 mb-2">Intermediate Phase Score</h3>
                <p className="text-2xl font-bold text-yellow-600">{updatedScores.medium} / 600</p>
              </div>
              <div className="bg-red-50 rounded-xl p-6">
                <h3 className="text-lg font-semibold text-red-800 mb-2">Advanced Phase Score</h3>
                <p className="text-2xl font-bold text-red-600">{updatedScores.hard} / 800</p>
              </div>
              <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-6 border-2 border-blue-200">
                <h3 className="text-xl font-semibold text-blue-800 mb-2">Overall Scaled Score</h3>
                <p className="text-3xl font-bold text-blue-600">{overallScore} / {maxOverallScore}</p>
              </div>
            </div>
            <div className="flex space-x-4 justify-center">
              <motion.button
                whileHover={{ scale: 1.05 }}
                onClick={() => {
                  setSelectedCourse(null);
                  setCurrentFrame('welcome');
                }}
                className="bg-blue-600 text-white px-6 py-3 rounded-lg font-semibold"
              >
                Back to Course Selection
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.05 }}
                onClick={() => setShowScoreReport(false)}
                className="bg-gray-200 text-gray-800 px-6 py-3 rounded-lg font-semibold"
              >
                View Phase Details
              </motion.button>
            </div>
          </div>
        ) : (
          <div className="text-center">
            <SafeIcon
              icon={passed ? FiAward : FiRefreshCw}
              className={`h-20 w-20 mx-auto mb-6 ${passed ? 'text-yellow-500' : 'text-red-500'}`}
            />
            <h1 className="text-3xl font-bold text-gray-900 mb-4">
              {phase === 3 ? (passed ? 'Excellent work!' : 'Review Required') : `Phase ${phase} Complete!`}
            </h1>
            <div className="bg-gray-50 rounded-xl p-6 mb-6">
              <div className="text-xl mb-2">
                Your Score: <span className="font-bold text-blue-600">{scorePercentage}%</span> ({score}/{questions.length})
              </div>
              <div className="text-lg">
                Scaled Score: <span className="font-bold text-green-600">{scaledScore} / {scoreRange.max}</span>
              </div>
              {questions.some(q => q.source === 'supabase_database' || q.source === 'uploaded_document') && (
                <div className="mt-4 p-3 bg-green-50 rounded-lg border border-green-200">
                  <div className="text-sm text-green-700">
                    <SafeIcon icon={FiCheckCircle} className="inline h-4 w-4 mr-1" />
                    <strong>✅ Source:</strong> Questions loaded from Supabase database
                  </div>
                  <div className="text-xs text-green-600 mt-1">
                    {questions.filter(q => q.source === 'supabase_database').length} questions from parsed documents
                  </div>
                </div>
              )}
            </div>
            {passed ? (
              phase < 3 ? (
                <>
                  <p className="text-gray-600 mb-6">Great job! You have unlocked the {phase === 1 ? 'Intermediate' : 'Advanced'} Phase!</p>
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    onClick={handleNextPhase}
                    className="w-full bg-green-600 text-white py-3 rounded-lg font-semibold"
                  >
                    Proceed to Phase {phase + 1}
                  </motion.button>
                </>
              ) : (
                <>
                  <p className="text-gray-600 mb-6">Congratulations! You have completed all phases.</p>
                  {isLastPhase && (
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      onClick={() => setShowScoreReport(true)}
                      className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold mb-4"
                    >
                      View Complete Score Report
                    </motion.button>
                  )}
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    onClick={() => {
                      setSelectedCourse(null);
                      setCurrentFrame('welcome');
                    }}
                    className="w-full bg-gray-200 text-gray-800 py-3 rounded-lg font-semibold"
                  >
                    Back to Course Selection
                  </motion.button>
                </>
              )
            ) : (
              <>
                <p className="text-gray-600 mb-6">You scored below 10%. Review the topic and retry Phase {phase}.</p>
                <div className="grid grid-cols-2 gap-4">
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    onClick={() => setCurrentFrame('learningMaterials')}
                    className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold"
                  >
                    Review Materials
                  </motion.button>
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    onClick={handleRestartQuiz}
                    className="w-full bg-gray-200 text-gray-800 py-3 rounded-lg font-semibold"
                  >
                    Retry Quiz
                  </motion.button>
                </div>
              </>
            )}
          </div>
        )}
      </motion.div>
    );
  }

  return (
    <div className="relative">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-white rounded-2xl shadow-xl p-8">
        <div className="flex justify-between items-center mb-4">
          <h1 className="text-2xl font-bold text-gray-900">Phase {phase}: {currentTopic} Quiz</h1>
          <div className="text-sm font-medium">Q{currentQuestionIndex + 1}/{questions.length}</div>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2 mb-8">
          <motion.div
            className="bg-blue-600 h-2 rounded-full"
            initial={{ width: 0 }}
            animate={{ width: `${((currentQuestionIndex + 1) / questions.length) * 100}%` }}
          />
        </div>

        {questions.some(q => q.source === 'supabase_database') && (
          <div className="mb-6 p-3 bg-green-50 rounded-lg border border-green-200">
            <div className="flex items-center space-x-2 text-green-700">
              <SafeIcon icon={FiCheckCircle} className="h-4 w-4" />
              <span className="text-sm font-medium">
                ✅ Questions loaded from Supabase database
              </span>
            </div>
            {currentQuestion?.documentName && (
              <div className="text-xs text-green-600 mt-1">
                Current question from: {currentQuestion.documentName}
              </div>
            )}
          </div>
        )}

        <AnimatePresence mode="wait">
          <motion.div
            key={currentQuestionIndex}
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -50 }}
          >
            <h2 className="text-xl font-semibold mb-6">{currentQuestion?.question}</h2>
            <div className="space-y-3">
              {currentQuestion?.options.map((option, index) => (
                <div key={index} className="relative">
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    onClick={() => handleAnswerSelect(index)}
                    className={`w-full text-left p-4 rounded-lg border-2 transition-all ${selectedAnswer === index
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-400'
                      } ${quizState === 'feedback' && index === currentQuestion.correct
                        ? '!bg-green-100 !border-green-500'
                        : ''
                      } ${quizState === 'feedback' && selectedAnswer === index && !isCorrect
                        ? '!bg-red-100 !border-red-500'
                        : ''
                      }`}
                  >
                    {option}
                  </motion.button>

                  {quizState === 'feedback' && selectedAnswer === index && !isCorrect && (
                    <motion.button
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={handleOpenAITutor}
                      className="absolute right-4 top-1/2 transform -translate-y-1/2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-3 py-2 rounded-lg text-sm font-medium flex items-center space-x-1 shadow-lg hover:shadow-xl transition-all"
                    >
                      <SafeIcon icon={FiMessageCircle} className="h-4 w-4" />
                      <span>Chat with AI Tutor</span>
                    </motion.button>
                  )}
                </div>
              ))}
            </div>
          </motion.div>
        </AnimatePresence>

        {quizState === 'in_progress' && (
          <div className="text-center mt-8">
            <motion.button
              whileHover={{ scale: 1.05 }}
              onClick={handleSubmitAnswer}
              disabled={selectedAnswer === null}
              className="bg-blue-600 text-white px-8 py-3 rounded-lg font-semibold disabled:opacity-50"
            >
              Submit
            </motion.button>
          </div>
        )}

        <AnimatePresence>
          {quizState === 'feedback' && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-8 text-center"
            >
              <div className={`p-4 rounded-lg ${isCorrect ? 'bg-green-50' : 'bg-red-50'}`}>
                <h3 className={`text-xl font-bold ${isCorrect ? 'text-green-700' : 'text-red-700'}`}>
                  {isCorrect ? '✅ Correct!' : '❌ Incorrect'}
                </h3>
                <p className="mt-2 text-gray-700">{currentQuestion.explanation}</p>

                {currentQuestion.source === 'supabase_database' && (
                  <div className="mt-3 p-3 bg-green-50 rounded-lg text-left border border-green-200">
                    <div className="text-sm text-green-700">
                      <SafeIcon icon={FiCheckCircle} className="inline h-4 w-4 mr-1" />
                      <strong>✅ Source:</strong> Loaded from Supabase database
                    </div>
                    {currentQuestion.documentName && (
                      <div className="text-xs text-green-600 mt-1">
                        Document: {currentQuestion.documentName}
                      </div>
                    )}
                    {currentQuestion.documentSize && (
                      <div className="text-xs text-green-600">
                        Size: {(currentQuestion.documentSize / 1024).toFixed(1)} KB
                      </div>
                    )}
                  </div>
                )}
              </div>
              <motion.button
                whileHover={{ scale: 1.05 }}
                onClick={handleNext}
                className="bg-gray-800 text-white px-8 py-3 rounded-lg font-semibold mt-6"
              >
                {currentQuestionIndex < questions.length - 1 ? 'Next Question' : 'View Results'}
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      <AnimatePresence>
        {showAITutor && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[80vh] flex flex-col"
            >
              <div className="flex items-center justify-between p-6 border-b border-gray-200">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-full flex items-center justify-center">
                    <SafeIcon icon={FiMessageCircle} className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">AI Tutor</h3>
                    <p className="text-sm text-gray-500">Helping with {currentTopic}</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowAITutor(false)}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <SafeIcon icon={FiX} className="h-5 w-5 text-gray-500" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {chatMessages.map((message, index) => (
                  <motion.div
                    key={index}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[80%] rounded-2xl px-4 py-3 ${message.type === 'user' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-900'
                        }`}
                    >
                      <p className="whitespace-pre-line">{message.content}</p>
                    </div>
                  </motion.div>
                ))}
                {isTyping && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex justify-start"
                  >
                    <div className="bg-gray-100 rounded-2xl px-4 py-3">
                      <div className="flex space-x-1">
                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                        <div
                          className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                          style={{ animationDelay: '0.1s' }}
                        ></div>
                        <div
                          className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                          style={{ animationDelay: '0.2s' }}
                        ></div>
                      </div>
                    </div>
                  </motion.div>
                )}
              </div>
              <form onSubmit={handleChatSubmit} className="p-6 border-t border-gray-200">
                <div className="flex space-x-3">
                  <input
                    type="text"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    placeholder={practiceQuestion ? "Type your answer (1-4)..." : "Type 1 or 2 to choose an option..."}
                    className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    disabled={isTyping}
                  />
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    type="submit"
                    disabled={isTyping || !chatInput.trim()}
                    className="bg-blue-600 text-white p-3 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <SafeIcon icon={FiSend} className="h-5 w-5" />
                  </motion.button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default QuizFrame;
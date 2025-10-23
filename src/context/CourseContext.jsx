import React, { createContext, useContext, useState, useEffect } from 'react';
    import supabase from '../supabase/supabase.js';
    
    const CourseContext = createContext();
    
    export const useCourse = () => {
      const context = useContext(CourseContext);
      if (!context) {
        throw new Error('useCourse must be used within a CourseProvider');
      }
      return context;
    };
    
    export const CourseProvider = ({ children }) => {
      const [courses, setCourses] = useState([]);
      const [selectedCourse, setSelectedCourse] = useState(null);
      const [currentLevel, setCurrentLevel] = useState('Easy');
      const [currentTopic, setCurrentTopic] = useState(null);
      const [studentProgress, setStudentProgress] = useState({});
      const [unlockedLevels, setUnlockedLevels] = useState({});
    
      // Load data from localStorage on mount
      useEffect(() => {
        const savedCourses = localStorage.getItem('aiTutorCourses');
        const savedProgress = localStorage.getItem('studentProgress');
        const savedUnlockedLevels = localStorage.getItem('unlockedLevels');
    
        if (savedCourses) {
          try {
            const parsedCourses = JSON.parse(savedCourses);
            if (Array.isArray(parsedCourses)) {
              setCourses(parsedCourses);
            } else {
              setCourses([]);
            }
          } catch (error) {
            console.error("Failed to parse courses from localStorage", error);
            setCourses([]);
          }
        }
    
        if (savedProgress) {
          try {
            const parsedProgress = JSON.parse(savedProgress);
            if (typeof parsedProgress === 'object' && parsedProgress !== null && !Array.isArray(parsedProgress)) {
              setStudentProgress(parsedProgress);
            } else {
              setStudentProgress({});
            }
          } catch (error) {
            console.error("Failed to parse student progress from localStorage", error);
            setStudentProgress({});
          }
        }
    
        if (savedUnlockedLevels) {
          try {
            const parsedUnlockedLevels = JSON.parse(savedUnlockedLevels);
            if (typeof parsedUnlockedLevels === 'object' && parsedUnlockedLevels !== null && !Array.isArray(parsedUnlockedLevels)) {
              setUnlockedLevels(parsedUnlockedLevels);
            } else {
              setUnlockedLevels({});
            }
          } catch (error) {
            console.error("Failed to parse unlocked levels from localStorage", error);
            setUnlockedLevels({});
          }
        }
      }, []);
    
      // Save courses to localStorage whenever courses change
      useEffect(() => {
        try {
          localStorage.setItem('aiTutorCourses', JSON.stringify(courses));
        } catch (error) {
          console.error("Failed to save courses to localStorage", error);
        }
      }, [courses]);
    
      // Save progress to localStorage whenever progress changes
      useEffect(() => {
        try {
          localStorage.setItem('studentProgress', JSON.stringify(studentProgress));
        } catch (error) {
          console.error("Failed to save student progress to localStorage", error);
        }
      }, [studentProgress]);
    
      // Save unlocked levels to localStorage
      useEffect(() => {
        try {
          localStorage.setItem('unlockedLevels', JSON.stringify(unlockedLevels));
        } catch (error) {
          console.error("Failed to save unlocked levels to localStorage", error);
        }
      }, [unlockedLevels]);
    
      const addCourse = (course) => {
        const newCourse = {
          ...course,
          id: course.id || Date.now().toString(),
          createdAt: new Date().toISOString(),
        };
        setCourses(prev => [...prev, newCourse]);
        return newCourse;
      };
    
      const updateCourse = (courseId, updates) => {
        setCourses(prev =>
          prev.map(course =>
            course.id === courseId ? { ...course, ...updates } : course
          )
        );
      };
    
      const deleteCourse = async (courseId) => {
        try {
          // First delete associated quiz data from Supabase
          const { data: uploads, error: fetchError } = await supabase
            .from('quiz_uploads')
            .select('file_path')
            .eq('course_id', courseId);
    
          if (fetchError) {
            console.error('Error fetching uploads for deletion:', fetchError);
            // Continue with course deletion even if this fails
          }
    
          // Delete files from Supabase Storage if they exist
          if (uploads && uploads.length > 0) {
            const filePaths = uploads.map(upload => upload.file_path).filter(Boolean);
            if (filePaths.length > 0) {
              const { error: storageError } = await supabase.storage
                .from('quiz-files')
                .remove(filePaths);
              if (storageError) {
                console.error('Error deleting files from storage:', storageError);
                // Continue with course deletion even if this fails
              }
            }
          }
    
          // Delete records from 'quiz_uploads', which cascades to 'quiz_questions'
          const { error: deleteUploadsError } = await supabase
            .from('quiz_uploads')
            .delete()
            .eq('course_id', courseId);
    
          if (deleteUploadsError) {
            console.error('Error deleting quiz uploads from DB:', deleteUploadsError);
            // Continue with course deletion even if this fails
          }
    
          // Update local state - THIS IS THE KEY FIX
          setCourses(prev => prev.filter(course => course.id !== courseId));
    
          // Also clear selection if the deleted course was selected
          if (selectedCourse?.id === courseId) {
            setSelectedCourse(null);
          }
    
          // Return success
          return { success: true };
        } catch (error) {
          console.error('Error during course deletion process:', error);
          throw error;
        }
      };
    
      const updateProgress = (courseId, level, topicId, progress) => {
        setStudentProgress(prev => ({
          ...prev,
          [courseId]: {
            ...prev[courseId],
            [level]: {
              ...prev[courseId]?.[level],
              [topicId]: progress,
            },
          },
        }));
      };
    
      const getTopicsForLevel = (course, level) => {
        if (!course) return [];
        const topics = course.topics?.[level] || [];
        if (topics.length === 0 && course.studyMaterials?.[level]?.length > 0) {
          const fallbackTopics = {
            'SAT Tutor': {
              Easy: ['Linear Equations', 'Basic Punctuation', 'Reading for Main Idea'],
              Medium: ['Systems of Equations', 'Grammar and Usage', 'Analyzing Paired Passages'],
              Hard: ['Advanced Functions', 'Rhetorical Analysis', 'Interpreting Complex Data'],
            },
            'Python Tutor': {
              Easy: ['Variables and Data Types', 'Basic Syntax', 'Simple Functions'],
              Medium: ['Lists and Dictionaries', 'Conditional Logic', 'Loops and Iteration'],
              Hard: ['Object-Oriented Programming', 'Decorators', 'Generators'],
            },
            'Math Tutor': {
              Easy: ['Basic Arithmetic', 'Fractions and Decimals', 'Simple Equations'],
              Medium: ['Algebraic Expressions', 'Linear Functions', 'Geometry Proofs'],
              Hard: ['Calculus Basics', 'Trigonometry', 'Advanced Statistics'],
            },
            'Science Tutor': {
              Easy: ['Scientific Method', 'Basic Chemistry', 'Simple Physics'],
              Medium: ['Chemical Reactions', 'Force and Motion', 'Cell Biology'],
              Hard: ['Quantum Physics', 'Organic Chemistry', 'Molecular Biology'],
            },
            'Language Tutor': {
              Easy: ['Basic Vocabulary', 'Simple Sentences', 'Common Phrases'],
              Medium: ['Complex Sentences', 'Grammar Rules', 'Writing Skills'],
              Hard: ['Literary Analysis', 'Advanced Composition', 'Linguistic Structures'],
            },
            'History Tutor': {
              Easy: ['Timeline Basics', 'Key Dates', 'Important Figures'],
              Medium: ['Historical Analysis', 'Cause and Effect', 'Primary Document Analysis'],
              Hard: ['Historiography', 'Advanced Research', 'Thematic Analysis'],
            },
          };
          return fallbackTopics[course.tutorType]?.[level] || [
            `Introduction to ${level} concepts`,
            `${level} Level Fundamentals`,
            `Advanced ${level} Topics`,
          ];
        }
        return topics;
      };
    
      const unlockNextLevel = (courseId, completedLevel) => {
        const levelOrder = ['Easy', 'Medium', 'Hard'];
        const completedIndex = levelOrder.indexOf(completedLevel);
        const currentUnlockedLevel = getUnlockedLevel(courseId);
        const currentUnlockedIndex = levelOrder.indexOf(currentUnlockedLevel);
    
        if (completedIndex !== -1 && completedIndex >= currentUnlockedIndex && completedIndex < levelOrder.length - 1) {
          const nextLevel = levelOrder[completedIndex + 1];
          setUnlockedLevels(prev => ({
            ...prev,
            [courseId]: nextLevel,
          }));
        }
      };
    
      const getUnlockedLevel = (courseId) => {
        return unlockedLevels[courseId] || 'Easy';
      };
    
      const value = {
        courses,
        selectedCourse,
        setSelectedCourse,
        currentLevel,
        setCurrentLevel,
        currentTopic,
        setCurrentTopic,
        studentProgress,
        addCourse,
        updateCourse,
        deleteCourse,
        updateProgress,
        getTopicsForLevel,
        unlockNextLevel,
        getUnlockedLevel,
      };
    
      return (
        <CourseContext.Provider value={value}>
          {children}
        </CourseContext.Provider>
      );
    };
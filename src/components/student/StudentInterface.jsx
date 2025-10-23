import { useState, useEffect } from 'react';
    import { useCourse } from '../../context/CourseContext';
    import { useAuth } from '../../context/AuthContext';
    import WelcomeFrame from './frames/WelcomeFrame';
    import TopicIntroFrame from './frames/TopicIntroFrame';
    import LearningMaterialsFrame from './frames/LearningMaterialsFrame';
    import VideosFrame from './frames/VideosFrame';
    import ChatFrame from './frames/ChatFrame';
    import ContinuationFrame from './frames/ContinuationFrame';
    import QuizTransitionFrame from './frames/QuizTransitionFrame';
    import QuizFrame from './frames/QuizFrame';

    const StudentInterface = () => {
      const { user } = useAuth();
      const { courses, selectedCourse, setSelectedCourse, currentLevel, setCurrentLevel } = useCourse();
      const [currentFrame, setCurrentFrame] = useState('welcome');
      const [frameData, setFrameData] = useState({});
      const [previousScores, setPreviousScores] = useState({ easy: 0, medium: 0, hard: 0 });

      const activeCourses = courses.filter(course => course.status);

      useEffect(() => {
        if (selectedCourse && currentFrame === 'welcome') {
          setCurrentFrame('topicIntro');
        }
      }, [selectedCourse, currentFrame]);

      const frameComponents = {
        welcome: WelcomeFrame,
        topicIntro: TopicIntroFrame,
        learningMaterials: LearningMaterialsFrame,
        videos: VideosFrame,
        chat: ChatFrame,
        continuation: ContinuationFrame,
        quizTransition: QuizTransitionFrame,
        quiz: QuizFrame,
      };

      const CurrentFrameComponent = frameComponents[currentFrame] || WelcomeFrame;

      // Ensure we have a valid component to render
      if (!CurrentFrameComponent) {
        return (
          <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
            <div className="text-center">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">Loading...</h2>
              <p className="text-gray-600">Please wait while we prepare your learning experience.</p>
            </div>
          </div>
        );
      }

      return (
        <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
          <div className="max-w-4xl mx-auto px-4 py-8">
            <CurrentFrameComponent
              courses={activeCourses}
              selectedCourse={selectedCourse}
              setSelectedCourse={setSelectedCourse}
              currentLevel={currentLevel}
              setCurrentLevel={setCurrentLevel}
              currentFrame={currentFrame}
              setCurrentFrame={setCurrentFrame}
              frameData={frameData}
              setFrameData={setFrameData}
              studentName={user?.fullName}
              previousScores={previousScores}
              setPreviousScores={setPreviousScores}
            />
          </div>
        </div>
      );
    };

    export default StudentInterface;
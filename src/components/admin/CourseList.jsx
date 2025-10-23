import { motion } from 'framer-motion';
    import { useCourse } from '../../context/CourseContext';
    import SafeIcon from '../../common/SafeIcon';
    import * as FiIcons from 'react-icons/fi';

    const { FiEdit2, FiTrash2, FiUsers, FiBook } = FiIcons;

    const CourseList = ({ onEditCourse }) => {
      const { courses, deleteCourse } = useCourse();

      const handleDelete = async (courseId) => {
        if (window.confirm('Are you sure you want to delete this course? This will also remove all associated quiz documents and questions. This action cannot be undone.')) {
          try {
            await deleteCourse(courseId);
            // Show success message
            alert('Course deleted successfully!');
          } catch (error) {
            console.error('Error deleting course:', error);
            alert(`Failed to delete course. Please try again. Error: ${error.message}`);
          }
        }
      };

      if (courses.length === 0) {
        return (
          <div className="text-center py-12">
            <SafeIcon icon={FiBook} className="h-16 w-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No courses yet</h3>
            <p className="text-gray-500">Get started by creating your first AI tutor course.</p>
          </div>
        );
      }

      return (
        <div className="space-y-6">
          <h3 className="text-xl font-semibold text-gray-900">All Courses</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {courses.map((course, index) => (
              <motion.div
                key={course.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
                className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden hover:shadow-xl transition-shadow"
              >
                <div className="p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div className={`px-3 py-1 rounded-full text-xs font-medium ${course.status ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                      {course.status ? 'Active' : 'Inactive'}
                    </div>
                    <span className="text-sm text-gray-500">{course.level}</span>
                  </div>
                  <h4 className="text-lg font-semibold text-gray-900 mb-2 line-clamp-2">
                    {course.title}
                  </h4>
                  <p className="text-gray-600 text-sm mb-4 line-clamp-3">
                    {course.description}
                  </p>
                  <div className="flex items-center justify-between text-sm text-gray-500 mb-4">
                    <span className="flex items-center">
                      <SafeIcon icon={FiUsers} className="h-4 w-4 mr-1" />
                      {course.tutorType}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-xs text-gray-500 mb-4">
                    <div className="text-center">
                      <div className="font-medium text-gray-900">
                        {course.topics?.Easy?.length || 0}
                      </div>
                      <div>Easy Topics</div>
                    </div>
                    <div className="text-center">
                      <div className="font-medium text-gray-900">
                        {course.topics?.Medium?.length || 0}
                      </div>
                      <div>Medium Topics</div>
                    </div>
                    <div className="text-center">
                      <div className="font-medium text-gray-900">
                        {course.topics?.Hard?.length || 0}
                      </div>
                      <div>Hard Topics</div>
                    </div>
                  </div>
                  <div className="flex justify-end space-x-2">
                    <button
                      onClick={() => onEditCourse(course)}
                      className="p-2 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                      title="Edit Course"
                    >
                      <SafeIcon icon={FiEdit2} className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(course.id)}
                      className="p-2 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      title="Delete Course"
                    >
                      <SafeIcon icon={FiTrash2} className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      );
    };

    export default CourseList;
import React, { useState, useEffect } from 'react';
import { Teacher } from '../types';
import { teacherService } from '../services/teacherService';
import { scheduleService } from '../services/scheduleService';
import { Users, Save, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { normalizeSubjectName } from '../utils/subjectUtils';

export const TeacherManagement: React.FC<{ role?: 'admin' | 'teacher' | 'ttcm' | null, department?: string | null }> = ({ role, department }) => {
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [departmentSubjects, setDepartmentSubjects] = useState<Record<string, string[]>>({});
  const [teacherTkbSubjects, setTeacherTkbSubjects] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const allTeachers = await teacherService.getAllTeachers();
        const allSchedules = await scheduleService.getAllSchedules();
        
        // Filter teachers based on role
        let filteredTeachers = allTeachers;
        if (role === 'ttcm' && department) {
          filteredTeachers = allTeachers.filter(t => t.group === department);
        }
        setTeachers(filteredTeachers);

        // Compute subjects per department based on TKB and main subjects
        const deptSubjectsMap: Record<string, Set<string>> = {};
        const teacherToDept: Record<string, string> = {};
        const tkbSubjectsMap: Record<string, Set<string>> = {};
        
        // Initialize with main subjects
        allTeachers.forEach(t => {
          if (t.group) {
            if (!deptSubjectsMap[t.group]) deptSubjectsMap[t.group] = new Set();
            if (t.subject) {
              const subjects = t.subject.split(',');
              subjects.forEach(sub => {
                const normalized = normalizeSubjectName(sub);
                if (normalized) {
                  deptSubjectsMap[t.group].add(normalized);
                }
              });
            }
            if (t.name) teacherToDept[t.name] = t.group;
          }
        });

        // Add subjects from TKB
        allSchedules.forEach(s => {
          const dept = teacherToDept[s.giao_vien];
          if (s.giao_vien) {
            if (!tkbSubjectsMap[s.giao_vien]) tkbSubjectsMap[s.giao_vien] = new Set();
          }
          
          if (s.mon) {
            // Split by comma in case there are multiple subjects in one cell
            const subjects = s.mon.split(',');
            subjects.forEach(sub => {
              const normalized = normalizeSubjectName(sub);
              if (normalized) {
                if (dept) deptSubjectsMap[dept].add(normalized);
                if (s.giao_vien) tkbSubjectsMap[s.giao_vien].add(normalized);
              }
            });
          }
        });

        // Convert Sets to sorted arrays
        const finalDeptSubjects: Record<string, string[]> = {};
        for (const dept in deptSubjectsMap) {
          finalDeptSubjects[dept] = Array.from(deptSubjectsMap[dept]).sort();
        }
        setDepartmentSubjects(finalDeptSubjects);

        const finalTkbSubjects: Record<string, string[]> = {};
        for (const gv in tkbSubjectsMap) {
          finalTkbSubjects[gv] = Array.from(tkbSubjectsMap[gv]);
        }
        setTeacherTkbSubjects(finalTkbSubjects);
      } catch (error) {
        console.error("Error fetching data:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [role, department]);

  const handleSubjectToggle = (teacherId: string | undefined, subject: string) => {
    if (!teacherId) return;

    setTeachers(prevTeachers => prevTeachers.map(teacher => {
      if (teacher.id === teacherId) {
        const currentSubjects = (teacher.teachableSubjects || []).map(s => normalizeSubjectName(s)).filter(Boolean);
        const newSubjects = currentSubjects.includes(subject)
          ? currentSubjects.filter(s => s !== subject)
          : [...currentSubjects, subject];
        return { ...teacher, teachableSubjects: Array.from(new Set(newSubjects)) };
      }
      return teacher;
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    setStatus(null);
    try {
      const updatePromises = teachers.map(teacher => {
        if (teacher.id) {
          const tkbSubs = teacher.name ? (teacherTkbSubjects[teacher.name] || []) : [];
          const mainSubs = teacher.subject ? teacher.subject.split(',').map(s => normalizeSubjectName(s)).filter(Boolean) : [];
          const currentSubs = (teacher.teachableSubjects || []).map(s => normalizeSubjectName(s)).filter(Boolean);
          const allSubs = Array.from(new Set([...currentSubs, ...tkbSubs, ...mainSubs]));
          
          return teacherService.updateTeacher(teacher.id, { 
            teachableSubjects: allSubs 
          });
        }
        return Promise.resolve();
      });

      await Promise.all(updatePromises);
      setStatus({ type: 'success', message: 'Đã lưu thông tin giáo viên thành công!' });
    } catch (error: any) {
      setStatus({ type: 'error', message: `Lỗi khi lưu: ${error.message}` });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader2 className="h-8 w-8 text-indigo-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-gray-800 flex items-center">
            <Users className="mr-2 text-indigo-600" /> Quản lý Giáo viên {role === 'ttcm' ? `(Tổ ${department})` : ''}
          </h2>
          <button
            onClick={handleSave}
            disabled={saving}
            className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white px-4 py-2 rounded-lg flex items-center shadow-sm font-medium transition-colors"
          >
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            Lưu thay đổi
          </button>
        </div>

        {status && (
          <div className={`p-4 mb-6 rounded-lg flex items-start ${status.type === 'success' ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
            {status.type === 'success' ? (
              <CheckCircle className="h-5 w-5 text-green-500 mr-2 mt-0.5" />
            ) : (
              <AlertCircle className="h-5 w-5 text-red-500 mr-2 mt-0.5" />
            )}
            <p className={`text-sm ${status.type === 'success' ? 'text-green-700' : 'text-red-700'}`}>
              {status.message}
            </p>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Giáo viên</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tổ chuyên môn</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Môn có thể dạy</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {teachers.map(teacher => (
                <tr key={teacher.id || teacher.name}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="font-medium text-gray-900">{teacher.name}</div>
                    <div className="text-sm text-gray-500">
                      Môn chính: {teacher.subject ? Array.from(new Set(teacher.subject.split(',').map(s => normalizeSubjectName(s)).filter(Boolean))).join(', ') : ''}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {teacher.group}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-wrap gap-2">
                      {(departmentSubjects[teacher.group] || []).map(subject => {
                        const mainSubjects = teacher.subject ? teacher.subject.split(',').map(s => normalizeSubjectName(s)).filter(Boolean) : [];
                        const tkbSubjects = teacher.name ? (teacherTkbSubjects[teacher.name] || []) : [];
                        const normalizedTeachableSubjects = (teacher.teachableSubjects || []).map(s => normalizeSubjectName(s));
                        
                        const isMainSubject = mainSubjects.includes(subject);
                        const isTkbSubject = tkbSubjects.includes(subject);
                        const isSelected = normalizedTeachableSubjects.includes(subject) || isMainSubject || isTkbSubject;
                        const isDisabled = isMainSubject || isTkbSubject;
                        
                        return (
                          <button
                            key={subject}
                            onClick={() => !isDisabled && handleSubjectToggle(teacher.id, subject)}
                            disabled={isDisabled}
                            className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                              isDisabled 
                                ? 'bg-indigo-100 text-indigo-800 border-indigo-200 cursor-not-allowed opacity-80' 
                                : isSelected
                                  ? 'bg-green-100 text-green-800 border-green-200 hover:bg-green-200'
                                  : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
                            }`}
                            title={isMainSubject ? 'Môn chính (không thể bỏ chọn)' : isTkbSubject ? 'Đang dạy trong TKB (không thể bỏ chọn)' : 'Nhấn để chọn/bỏ chọn'}
                          >
                            {subject}
                          </button>
                        );
                      })}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {teachers.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              Không có dữ liệu giáo viên.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

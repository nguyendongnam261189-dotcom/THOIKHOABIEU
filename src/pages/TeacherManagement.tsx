import React, { useState, useEffect, useMemo } from 'react';
import { Teacher } from '../types';
import { teacherService } from '../services/teacherService';
import { scheduleService } from '../services/scheduleService';
import { Users, Save, CheckCircle, AlertCircle, Loader2, Search } from 'lucide-react';
import { normalizeSubjectName } from '../utils/subjectUtils';

export const TeacherManagement: React.FC<{ role?: 'admin' | 'teacher' | 'ttcm' | null, department?: string | null }> = ({ role, department }) => {
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [departmentSubjects, setDepartmentSubjects] = useState<Record<string, string[]>>({});
  const [teacherTkbSubjects, setTeacherTkbSubjects] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null);

  // States for filtering
  const [searchName, setSearchName] = useState('');
  const [filterSubject, setFilterSubject] = useState('');
  const [filterGroup, setFilterGroup] = useState('');

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
        
        // Sắp xếp theo tên Alphabet
        const sortedTeachers = filteredTeachers.sort((a, b) => {
          const nameA = a.name.split(' ').pop() || '';
          const nameB = b.name.split(' ').pop() || '';
          return nameA.localeCompare(nameB, 'vi');
        });
        
        setTeachers(sortedTeachers);

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
      setStatus({ type: 'success', message: 'Đã lưu thông tin môn dạy thay thành công!' });
    } catch (error: any) {
      setStatus({ type: 'error', message: `Lỗi khi lưu: ${error.message}` });
    } finally {
      setSaving(false);
    }
  };

  // --- LOGIC LỌC & GOM NHÓM THEO TỔ CHUYÊN MÔN ---
  const filteredAndGroupedTeachers = useMemo(() => {
    // 1. Lọc giáo viên
    const filtered = teachers.filter(t => {
      const matchName = t.name.toLowerCase().includes(searchName.toLowerCase());
      const matchSubject = filterSubject ? t.subject.split(',').map(s => s.trim()).includes(filterSubject) : true;
      const matchGroup = filterGroup ? t.group === filterGroup : true;
      return matchName && matchSubject && matchGroup;
    });

    // 2. Gom nhóm theo Tổ
    const groups: Record<string, Teacher[]> = {};
    filtered.forEach(t => {
      const groupName = t.group || 'Chưa phân tổ';
      if (!groups[groupName]) groups[groupName] = [];
      groups[groupName].push(t);
    });

    return groups;
  }, [teachers, searchName, filterSubject, filterGroup]);

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
        
        {/* HEADER */}
        <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4 mb-6 pb-4 border-b border-gray-100">
          <div>
            <h2 className="text-2xl font-bold text-gray-800 flex items-center">
              <Users className="mr-2 text-indigo-600" /> Quản lý Môn dạy thay
            </h2>
            <p className="text-gray-500 text-sm mt-1">
              {role === 'ttcm' ? `Chỉ hiển thị giáo viên Tổ ${department}` : 'Thiết lập các môn học mà giáo viên có thể dạy thay chéo.'}
            </p>
          </div>
          
          <button
            onClick={handleSave}
            disabled={saving}
            className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white px-5 py-2.5 rounded-lg flex items-center shadow-sm font-medium transition-colors w-full md:w-auto justify-center"
          >
            {saving ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <Save className="w-5 h-5 mr-2" />}
            Lưu tất cả thay đổi
          </button>
        </div>

        {/* THÔNG BÁO LƯU */}
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

        {/* THANH BỘ LỌC */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8 bg-gray-50 p-4 rounded-xl border border-gray-100">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5" />
            <input
              type="text"
              placeholder="Tìm theo tên giáo viên..."
              className="pl-10 pr-4 py-2 w-full border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
              value={searchName}
              onChange={(e) => setSearchName(e.target.value)}
            />
          </div>
          
          <select
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
            value={filterSubject}
            onChange={(e) => setFilterSubject(e.target.value)}
          >
            <option value="">Tất cả môn chính</option>
            {Array.from(new Set(teachers.flatMap(t => t.subject.split(', ')))).filter(Boolean).sort().map(sub => (
              <option key={sub} value={sub}>{sub}</option>
            ))}
          </select>

          {role !== 'ttcm' && (
            <select
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
              value={filterGroup}
              onChange={(e) => setFilterGroup(e.target.value)}
            >
              <option value="">Tất cả Tổ chuyên môn</option>
              {Array.from(new Set(teachers.map(t => t.group))).filter(Boolean).sort().map(grp => (
                <option key={grp} value={grp}>{grp}</option>
              ))}
            </select>
          )}
        </div>

        {/* DANH SÁCH GIÁO VIÊN GOM NHÓM THEO TỔ */}
        <div className="space-y-8 animate-in fade-in">
          {Object.keys(filteredAndGroupedTeachers).sort().map((groupName) => (
            <div key={groupName} className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
              <div className="bg-gray-50 px-5 py-3 border-b border-gray-200 flex justify-between items-center">
                  <h3 className="font-bold text-gray-800 text-lg flex items-center">
                      <Users className="w-5 h-5 mr-2 text-indigo-600" />
                      {groupName}
                  </h3>
                  <span className="bg-indigo-100 text-indigo-800 text-sm font-bold px-3 py-1 rounded-full border border-indigo-200">
                      {filteredAndGroupedTeachers[groupName].length} giáo viên
                  </span>
              </div>
              
              <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-white">
                          <tr>
                              <th className="px-4 py-3 text-center text-xs font-bold text-gray-500 uppercase w-16 border-r">STT</th>
                              <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase w-1/4 border-r">Giáo viên</th>
                              <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase w-1/5 border-r">Môn chính yếu</th>
                              <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase">Cấp quyền môn có thể dạy thay</th>
                          </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-100">
                          {filteredAndGroupedTeachers[groupName].map((teacher, index) => (
                              <tr key={teacher.id || teacher.name} className="hover:bg-indigo-50/30 transition-colors">
                                  <td className="px-4 py-4 text-sm text-gray-500 text-center font-medium border-r">{index + 1}</td>
                                  
                                  <td className="px-4 py-4 border-r">
                                      <div className="font-bold text-indigo-800 text-base">{teacher.name}</div>
                                  </td>
                                  
                                  <td className="px-4 py-4 border-r">
                                      <div className="text-sm font-medium text-gray-700 bg-gray-100 inline-block px-2 py-1 rounded">
                                        {teacher.subject ? Array.from(new Set(teacher.subject.split(',').map(s => normalizeSubjectName(s)).filter(Boolean))).join(', ') : 'Chưa cập nhật'}
                                      </div>
                                  </td>
                                  
                                  <td className="px-4 py-4">
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
                                                      className={`px-3 py-1.5 rounded-md text-xs font-medium border shadow-sm transition-all ${
                                                          isDisabled 
                                                              ? 'bg-gray-100 text-gray-500 border-gray-200 cursor-not-allowed' 
                                                              : isSelected
                                                                  ? 'bg-indigo-100 text-indigo-800 border-indigo-300 hover:bg-indigo-200 hover:border-indigo-400'
                                                                  : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50 hover:border-gray-400'
                                                      }`}
                                                      title={isMainSubject ? 'Môn chính thức (Mặc định chọn)' : isTkbSubject ? 'Đang dạy trong TKB (Mặc định chọn)' : 'Nhấn để Cấp quyền / Thu hồi'}
                                                  >
                                                      {subject}
                                                  </button>
                                              );
                                          })}
                                          
                                          {(!departmentSubjects[teacher.group] || departmentSubjects[teacher.group].length === 0) && (
                                              <span className="text-xs text-gray-400 italic">Không có môn học nào được phân bổ cho Tổ này.</span>
                                          )}
                                      </div>
                                  </td>
                              </tr>
                          ))}
                      </tbody>
                  </table>
              </div>
            </div>
          ))}
          
          {Object.keys(filteredAndGroupedTeachers).length === 0 && (
            <div className="text-center py-16 text-gray-500 bg-gray-50 rounded-xl border border-dashed border-gray-300">
              <Users className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-lg font-medium text-gray-600">Không tìm thấy giáo viên.</p>
              <p className="text-sm mt-1">Vui lòng kiểm tra lại điều kiện lọc hoặc cập nhật dữ liệu.</p>
            </div>
          )}
        </div>

      </div>
    </div>
  );
};

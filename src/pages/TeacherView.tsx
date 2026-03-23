import React, { useState, useEffect } from 'react';
import { Schedule, Teacher } from '../types';
import { scheduleService } from '../services/scheduleService';
import { teacherService } from '../services/teacherService';
import { Search, Calendar } from 'lucide-react';

export const TeacherView: React.FC = () => {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [searchName, setSearchName] = useState('');
  const [selectedTeacher, setSelectedTeacher] = useState<string | null>(null);
  const [filterSubject, setFilterSubject] = useState('');
  const [filterGroup, setFilterGroup] = useState('');
  const [filterSession, setFilterSession] = useState('');

  useEffect(() => {
    const fetchData = async () => {
      const allSchedules = await scheduleService.getAllSchedules();
      const allTeachers = await teacherService.getAllTeachers();
      setSchedules(allSchedules);
      setTeachers(allTeachers);
    };
    fetchData();
  }, []);

  const filteredTeachers = teachers.filter(t => {
    const matchName = t.name.toLowerCase().includes(searchName.toLowerCase());
    const matchSubject = filterSubject ? t.subject.split(', ').includes(filterSubject) : true;
    const matchGroup = filterGroup ? t.group === filterGroup : true;
    return matchName && matchSubject && matchGroup;
  });

  const getScheduleForTeacher = (teacherName: string) => {
    // Không cần lọc Sáng/Chiều ở đây nữa, vì bảng Grid sẽ tự động chỉ vẽ các dòng tương ứng
    return schedules.filter(s => s.giao_vien === teacherName);
  };

  const renderScheduleGrid = (teacherSchedules: Schedule[]) => {
    const days = [2, 3, 4, 5, 6, 7];

    // LOGIC MỚI: Định nghĩa rõ ràng Tiết 1-5 cho từng buổi
    let rowDefs: { tiet: number, buoi: 'Sáng' | 'Chiều' }[] = [];
    
    if (filterSession === 'Sáng' || filterSession === '') {
      for (let i = 1; i <= 5; i++) rowDefs.push({ tiet: i, buoi: 'Sáng' });
    }
    if (filterSession === 'Chiều' || filterSession === '') {
      for (let i = 1; i <= 5; i++) rowDefs.push({ tiet: i, buoi: 'Chiều' });
    }

    return (
      <div className="overflow-x-auto mt-6 bg-white rounded-xl shadow-sm border border-gray-200">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-r">Tiết \ Thứ</th>
              {days.map(day => (
                <th key={day} className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-r">
                  Thứ {day}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {rowDefs.map((row) => (
              <tr key={`${row.buoi}-${row.tiet}`} className={row.buoi === 'Sáng' && row.tiet === 5 && filterSession === '' ? 'border-b-4 border-gray-300' : ''}>
                <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900 border-r bg-gray-50">
                  Tiết {row.tiet} ({row.buoi})
                </td>
                {days.map(day => {
                  // Chỉ tìm đúng Tiết (1-5) và đúng Buổi (Sáng/Chiều)
                  const slot = teacherSchedules.find(s => s.thu === day && s.tiet === row.tiet && s.buoi === row.buoi);
                  
                  return (
                    <td key={`${day}-${row.buoi}-${row.tiet}`} className={`px-4 py-3 whitespace-nowrap text-sm text-center border-r ${slot ? 'bg-indigo-50' : 'bg-gray-100/50'}`}>
                      {slot ? (
                        <div className="flex flex-col items-center">
                          <span className="font-bold text-indigo-700">{slot.lop}</span>
                          <span className="text-xs text-gray-600">{slot.mon}</span>
                          <span className="text-xs text-gray-500">P.{slot.phong}</span>
                        </div>
                      ) : (
                        <span className="text-gray-400 text-xs italic">Trống</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
        <h2 className="text-2xl font-bold text-gray-800 mb-6 flex items-center">
          <Calendar className="mr-2 text-indigo-600" /> Tra cứu Thời khóa biểu
        </h2>
        
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5" />
            <input
              type="text"
              placeholder="Tìm tên giáo viên..."
              className="pl-10 pr-4 py-2 w-full border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              value={searchName}
              onChange={(e) => setSearchName(e.target.value)}
            />
          </div>
          
          <select
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
            value={filterSubject}
            onChange={(e) => setFilterSubject(e.target.value)}
          >
            <option value="">Tất cả môn học</option>
            {Array.from(new Set(teachers.flatMap(t => t.subject.split(', ')))).sort().map(sub => (
              <option key={sub} value={sub}>{sub}</option>
            ))}
          </select>

          <select
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
            value={filterGroup}
            onChange={(e) => setFilterGroup(e.target.value)}
          >
            <option value="">Tất cả tổ chuyên môn</option>
            {Array.from(new Set(teachers.map(t => t.group))).filter(Boolean).map(grp => (
              <option key={grp} value={grp}>{grp}</option>
            ))}
          </select>

          <select
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
            value={filterSession}
            onChange={(e) => setFilterSession(e.target.value)}
          >
            <option value="">Cả ngày</option>
            <option value="Sáng">Sáng</option>
            <option value="Chiều">Chiều</option>
          </select>
        </div>

        {/* Teacher Selection List */}
        {!selectedTeacher && (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {filteredTeachers.map(teacher => (
              <button
                key={teacher.id || teacher.name}
                onClick={() => setSelectedTeacher(teacher.name)}
                className="p-3 text-sm border border-gray-200 rounded-lg hover:bg-indigo-50 hover:border-indigo-300 transition-colors text-left flex flex-col"
              >
                <span className="font-semibold text-gray-800">{teacher.name}</span>
                <span className="text-xs text-gray-500">{teacher.subject}</span>
              </button>
            ))}
          </div>
        )}

        {/* Selected Teacher Schedule */}
        {selectedTeacher && (
          <div>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold text-indigo-700">TKB: {selectedTeacher}</h3>
              <button 
                onClick={() => setSelectedTeacher(null)}
                className="text-sm text-gray-600 hover:text-indigo-600 underline"
              >
                ← Chọn giáo viên khác
              </button>
            </div>
            {renderScheduleGrid(getScheduleForTeacher(selectedTeacher))}
          </div>
        )}
      </div>
    </div>
  );
};

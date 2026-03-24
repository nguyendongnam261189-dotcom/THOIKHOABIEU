import React, { useState, useEffect, useMemo } from 'react';
import { Schedule, Teacher } from '../types';
import { scheduleService } from '../services/scheduleService';
import { teacherService } from '../services/teacherService';
import { Search, Calendar, Users, AlertCircle, layers } from 'lucide-react';

export const TeacherView: React.FC<{ role?: 'admin' | 'manager' | 'teacher' | 'ttcm' | null, department?: string | null, teacherName?: string | null }> = ({ role, department, teacherName }) => {
  const [allSchedules, setAllSchedules] = useState<Schedule[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [searchName, setSearchName] = useState('');
  const [selectedTeacher, setSelectedTeacher] = useState<string | null>(null);
  const [filterSubject, setFilterSubject] = useState('');
  const [filterGroup, setFilterGroup] = useState('');
  const [filterSession, setFilterSession] = useState('');
  
  // 🔥 STATES MỚI CHO ĐA PHIÊN BẢN
  const [versions, setVersions] = useState<string[]>([]);
  const [selectedVersion, setSelectedVersion] = useState<string>('');
  
  const [hasAutoLoaded, setHasAutoLoaded] = useState(false); 

  const isOrphanTeacher = (role !== 'admin' && role !== 'manager') && (!department || department === 'undefined' || String(department) === 'null');
  const isMissingLink = (role !== 'admin' && role !== 'manager') && !isOrphanTeacher && (!teacherName || String(teacherName) === 'null');

  useEffect(() => {
    const fetchData = async () => {
      const schedulesData = await scheduleService.getAllSchedules();
      const teachersData = await teacherService.getAllTeachers();
      setAllSchedules(schedulesData);
      
      // 🔥 TRÍCH XUẤT DANH SÁCH PHIÊN BẢN TỪ DỮ LIỆU
      const uniqueVersions = Array.from(new Set(schedulesData.map(s => s.versionName || 'Mặc định'))).sort().reverse();
      setVersions(uniqueVersions);
      if (uniqueVersions.length > 0 && !selectedVersion) {
        setSelectedVersion(uniqueVersions[0]); // Mặc định chọn bản mới nhất
      }

      let allowedTeachers = teachersData;
      if (role !== 'admin' && role !== 'manager') {
        if (!isOrphanTeacher) {
          allowedTeachers = teachersData.filter(t => t.group === department);
        } else {
          allowedTeachers = [];
        }
      }
      
      const sortedTeachers = allowedTeachers.sort((a, b) => {
          if ((role !== 'admin' && role !== 'manager') && teacherName) {
              if (a.name === teacherName) return -1;
              if (b.name === teacherName) return 1;
          }
          const nameA = a.name.split(' ').pop() || '';
          const nameB = b.name.split(' ').pop() || '';
          return nameA.localeCompare(nameB, 'vi');
      });
      
      setTeachers(sortedTeachers);
    };
    fetchData();
  }, [role, department, teacherName, isOrphanTeacher]);

  // 🔥 LỌC LỊCH DẠY THEO PHIÊN BẢN ĐÃ CHỌN
  const schedules = useMemo(() => {
    return allSchedules.filter(s => (s.versionName || 'Mặc định') === selectedVersion);
  }, [allSchedules, selectedVersion]);

  useEffect(() => {
    if ((role !== 'admin' && role !== 'manager') && teacherName && teachers.length > 0 && !hasAutoLoaded) {
      const exists = teachers.some(t => t.name === teacherName);
      if (exists) {
        setSelectedTeacher(teacherName);
      }
      setHasAutoLoaded(true); 
    }
  }, [role, teacherName, teachers, hasAutoLoaded]);

  const teacherSessions = useMemo(() => {
    const map = new Map<string, { sang: boolean, chieu: boolean }>();
    schedules.forEach(s => {
      if (!map.has(s.giao_vien)) {
        map.set(s.giao_vien, { sang: false, chieu: false });
      }
      const t = map.get(s.giao_vien)!;
      if (s.buoi === 'Sáng') t.sang = true;
      if (s.buoi === 'Chiều') t.chieu = true;
    });
    return map;
  }, [schedules]);

  // 🔥 CHỈ HIỆN NHỮNG GIÁO VIÊN CÓ LỊCH TRONG PHIÊN BẢN NÀY (Hoặc hiện tất cả nếu là Admin/Manager)
  const filteredTeachers = teachers.filter(t => {
    const hasScheduleInVersion = schedules.some(s => s.giao_vien === t.name);
    if (!hasScheduleInVersion && role !== 'admin' && role !== 'manager') return false;

    const matchName = t.name.toLowerCase().includes(searchName.toLowerCase());
    const matchSubject = filterSubject ? t.subject.split(', ').includes(filterSubject) : true;
    const matchGroup = filterGroup ? t.group === filterGroup : true;
    
    let matchSession = true;
    const sessions = teacherSessions.get(t.name) || { sang: false, chieu: false };
    if (filterSession === 'Sáng') matchSession = sessions.sang && !sessions.chieu; 
    else if (filterSession === 'Chiều') matchSession = !sessions.sang && sessions.chieu; 
    else if (filterSession === 'Cả ngày') matchSession = sessions.sang && sessions.chieu;  

    return matchName && matchSubject && matchGroup && matchSession;
  });

  const groupedTeachers = useMemo(() => {
    const groups: Record<string, Teacher[]> = {};
    filteredTeachers.forEach(t => {
      const groupName = t.group || 'Chưa phân tổ';
      if (!groups[groupName]) groups[groupName] = [];
      groups[groupName].push(t);
    });
    return groups;
  }, [filteredTeachers]);

  const renderScheduleGrid = (teacherSchedules: Schedule[]) => {
    const days = [2, 3, 4, 5, 6, 7];
    let rowDefs: { tiet: number, buoi: 'Sáng' | 'Chiều' }[] = [];
    if (filterSession === 'Sáng' || filterSession === '' || filterSession === 'Cả ngày') {
      for (let i = 1; i <= 5; i++) rowDefs.push({ tiet: i, buoi: 'Sáng' });
    }
    if (filterSession === 'Chiều' || filterSession === '' || filterSession === 'Cả ngày') {
      for (let i = 1; i <= 5; i++) rowDefs.push({ tiet: i, buoi: 'Chiều' });
    }

    return (
      <div className="overflow-x-auto mt-6 bg-white rounded-xl shadow-sm border border-gray-200">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-r">Tiết \ Thứ</th>
              {days.map(day => (
                <th key={day} className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-r">Thứ {day}</th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {rowDefs.map((row) => (
              <tr key={`${row.buoi}-${row.tiet}`} className={row.buoi === 'Sáng' && row.tiet === 5 && (filterSession === '' || filterSession === 'Cả ngày') ? 'border-b-4 border-gray-300' : ''}>
                <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900 border-r bg-gray-50">Tiết {row.tiet} ({row.buoi})</td>
                {days.map(day => {
                  const slot = teacherSchedules.find(s => s.thu === day && s.tiet === row.tiet && s.buoi === row.buoi);
                  const cleanPhong = slot?.phong ? String(slot.phong).trim() : '';
                  const hasRoom = cleanPhong !== '' && cleanPhong.toLowerCase() !== 'null' && cleanPhong.toLowerCase() !== 'undefined';
                  return (
                    <td key={`${day}-${row.buoi}-${row.tiet}`} className={`px-4 py-3 whitespace-nowrap text-sm text-center border-r ${slot ? 'bg-indigo-50' : 'bg-gray-100/50'}`}>
                      {slot ? (
                        <div className="flex flex-col items-center">
                          <span className="font-bold text-indigo-700">{slot.lop}</span>
                          <span className="text-xs text-gray-600">{slot.mon}</span>
                          {hasRoom && <span className="text-xs text-gray-500">P.{cleanPhong}</span>}
                        </div>
                      ) : <span className="text-gray-400 text-xs italic">Trống</span>}
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
        <div className="flex flex-col lg:flex-row justify-between lg:items-center mb-6 border-b pb-4 border-gray-100 gap-4">
            <div>
              <h2 className="text-2xl font-bold text-gray-800 flex items-center">
                <Calendar className="mr-2 text-indigo-600" /> Tra cứu Thời khóa biểu
              </h2>
              <p className="text-gray-500 text-sm mt-1">
                {(role === 'admin' || role === 'manager') 
                  ? 'Tra cứu Thời khóa biểu của toàn bộ giáo viên trường.' 
                  : isOrphanTeacher 
                    ? 'Tài khoản của bạn chưa được gán Tổ chuyên môn.'
                    : isMissingLink
                      ? 'Tài khoản chưa được liên kết với Tên trong TKB.'
                      : `Tra cứu Thời khóa biểu của giáo viên trong Tổ ${displayDepartment}.`}
              </p>
            </div>
            
            {/* 🔥 BỘ CHỌN PHIÊN BẢN TKB */}
            <div className="flex items-center bg-indigo-50 p-2 rounded-xl border border-indigo-100 shadow-sm">
              <span className="text-indigo-700 font-bold text-sm mr-3 flex items-center shrink-0">
                Phiên bản:
              </span>
              <select 
                className="bg-white border-none rounded-lg text-sm font-bold text-gray-800 focus:ring-2 focus:ring-indigo-500 py-1.5 px-3 min-w-[150px]"
                value={selectedVersion}
                onChange={(e) => {
                  setSelectedVersion(e.target.value);
                  setSelectedTeacher(null); // Reset lại khi đổi phiên bản
                }}
              >
                {versions.map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
        </div>
        
        <div className={`grid grid-cols-1 gap-4 mb-6 ${(role === 'admin' || role === 'manager') ? 'md:grid-cols-4' : 'md:grid-cols-3'}`}>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5" />
            <input
              type="text"
              placeholder="Tìm tên giáo viên..."
              className="pl-10 pr-4 py-2 w-full border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-100"
              value={searchName}
              onChange={(e) => setSearchName(e.target.value)}
              disabled={isOrphanTeacher}
            />
          </div>
          
          <select
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-100"
            value={filterSubject}
            onChange={(e) => setFilterSubject(e.target.value)}
            disabled={isOrphanTeacher}
          >
            <option value="">Tất cả môn học</option>
            {Array.from(new Set(teachers.flatMap(t => t.subject.split(', ')))).filter(Boolean).sort().map(sub => (
              <option key={sub} value={sub}>{sub}</option>
            ))}
          </select>

          {(role === 'admin' || role === 'manager') && (
            <select
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
              value={filterGroup}
              onChange={(e) => setFilterGroup(e.target.value)}
            >
              <option value="">Tất cả tổ chuyên môn</option>
              {Array.from(new Set(teachers.map(t => t.group))).filter(Boolean).sort().map(grp => (
                <option key={grp} value={grp}>{grp}</option>
              ))}
            </select>
          )}

          <select
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-100"
            value={filterSession}
            onChange={(e) => {
              setFilterSession(e.target.value);
              setSelectedTeacher(null); 
            }}
            disabled={isOrphanTeacher}
          >
            <option value="">Tất cả các buổi</option>
            <option value="Sáng">Chỉ dạy Sáng</option>
            <option value="Chiều">Chỉ dạy Chiều</option>
            <option value="Cả ngày">Dạy cả Sáng & Chiều</option>
          </select>
        </div>

        {(isOrphanTeacher || isMissingLink) ? (
          <div className="flex flex-col items-center justify-center py-16 bg-yellow-50 rounded-xl border border-dashed border-yellow-300">
             <AlertCircle className="w-16 h-16 text-yellow-500 mb-4" />
             <h3 className="text-xl font-bold text-yellow-800 mb-2">Thông tin chưa hoàn thiện</h3>
             <p className="text-yellow-700 text-center max-w-md">
               Tài khoản của bạn đã được duyệt nhưng <strong>{isOrphanTeacher ? "chưa được gắn Tổ chuyên môn" : "chưa liên kết với Tên TKB"}.</strong><br/><br/>
               Vui lòng báo Admin cập nhật thông tin cho tài khoản của bạn ở trang Quản lý người dùng.
             </p>
          </div>
        ) : (
          !selectedTeacher && (
            <div className="space-y-8 animate-in fade-in">
              {Object.keys(groupedTeachers).sort().map((groupName) => (
                <div key={groupName} className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                  <div className="bg-gray-50 px-4 py-3 border-b border-gray-200 flex justify-between items-center">
                      <h3 className="font-bold text-gray-800 text-lg flex items-center">
                          <Users className="w-5 h-5 mr-2 text-indigo-600" />
                          {groupName}
                      </h3>
                      <span className="bg-indigo-100 text-indigo-800 text-xs font-bold px-2.5 py-1 rounded-full border border-indigo-200">
                          {groupedTeachers[groupName].length} người
                      </span>
                  </div>
                  
                  <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200">
                          <thead className="bg-white">
                              <tr>
                                  <th className="px-6 py-3 text-center text-xs font-bold text-gray-500 uppercase w-20 bg-gray-50/50 border-r">STT</th>
                                  <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase bg-gray-50/50 border-r">Họ và tên Giáo viên</th>
                                  <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase bg-gray-50/50">Môn giảng dạy</th>
                              </tr>
                          </thead>
                          <tbody className="bg-white divide-y divide-gray-100">
                              {groupedTeachers[groupName].map((teacher, index) => {
                                  const isCurrentUser = (role !== 'admin' && role !== 'manager') && teacherName === teacher.name;
                                  return (
                                    <tr 
                                        key={teacher.name} 
                                        onClick={() => setSelectedTeacher(teacher.name)}
                                        className={`cursor-pointer transition-colors ${
                                          isCurrentUser ? 'bg-indigo-50/80 hover:bg-indigo-100' : 'hover:bg-indigo-50/50'
                                        }`}
                                    >
                                        <td className={`px-6 py-3 text-sm text-center border-r ${isCurrentUser ? 'text-indigo-800 font-bold' : 'text-gray-500 font-medium'}`}>{index + 1}</td>
                                        <td className={`px-6 py-3 text-sm border-r flex items-center ${isCurrentUser ? 'font-bold text-indigo-800' : 'font-semibold text-indigo-700'}`}>
                                          {teacher.name}
                                          {isCurrentUser && <span className="ml-2 bg-indigo-600 text-white text-[10px] px-2 py-0.5 rounded-full">Bạn</span>}
                                        </td>
                                        <td className="px-6 py-3 text-sm text-gray-600">
                                          <span className={`px-2 py-1 rounded text-sm ${isCurrentUser ? 'bg-white font-semibold text-indigo-700' : 'bg-gray-100 font-medium text-gray-700'}`}>
                                            {teacher.subject || 'Chưa phân công'}
                                          </span>
                                        </td>
                                    </tr>
                                  );
                              })}
                          </tbody>
                      </table>
                  </div>
                </div>
              ))}
              {filteredTeachers.length === 0 && !isOrphanTeacher && (
                <div className="text-center py-12 text-gray-500 bg-gray-50 rounded-xl border border-dashed border-gray-300">
                  Không tìm thấy giáo viên hoặc giáo viên không có lịch dạy trong phiên bản "{selectedVersion}".
                </div>
              )}
            </div>
          )
        )}

        {selectedTeacher && !isOrphanTeacher && !isMissingLink && (
          <div className="animate-in slide-in-from-right-4 duration-300">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold text-indigo-700">TKB: {selectedTeacher} ({selectedVersion})</h3>
              <button 
                onClick={() => setSelectedTeacher(null)}
                className="text-sm text-white bg-gray-600 hover:bg-gray-700 px-4 py-2 rounded-lg transition-colors font-medium"
              >
                {(role === 'admin' || role === 'manager') ? '← Trở lại danh sách' : '← Xem TKB người khác trong Tổ'}
              </button>
            </div>
            {renderScheduleGrid(schedules.filter(s => s.giao_vien === selectedTeacher))}
          </div>
        )}
      </div>
    </div>
  );
};

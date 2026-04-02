import React, { useState, useEffect, useMemo } from 'react';
import { Schedule, Teacher } from '../types';
import { scheduleService } from '../services/scheduleService';
import { teacherService } from '../services/teacherService';
import { Search, Calendar, Users, AlertCircle, PhoneCall, Phone, MessageCircle, Video, BookOpen, Layers, ChevronLeft } from 'lucide-react';

export const Directory: React.FC<{ role?: 'admin' | 'manager' | 'teacher' | 'ttcm' | null, department?: string | null, teacherName?: string | null }> = ({ role, department, teacherName }) => {
  const [allSchedules, setAllSchedules] = useState<Schedule[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  
  // States cho Bộ lọc
  const [searchQuery, setSearchQuery] = useState('');
  const [filterGroup, setFilterGroup] = useState('');
  const [filterSession, setFilterSession] = useState('');
  
  // States cho Đa phiên bản
  const [versions, setVersions] = useState<string[]>([]);
  const [selectedVersion, setSelectedVersion] = useState<string>('');
  
  // States Giao diện
  const [expandedTeacherId, setExpandedTeacherId] = useState<string | null>(null);
  const [viewingScheduleFor, setViewingScheduleFor] = useState<string | null>(null);

  const isOrphanTeacher = (role !== 'admin' && role !== 'manager') && (!department || department === 'undefined' || String(department) === 'null');
  const isMissingLink = (role !== 'admin' && role !== 'manager') && !isOrphanTeacher && (!teacherName || String(teacherName) === 'null');

  useEffect(() => {
    const fetchData = async () => {
      const schedulesData = await scheduleService.getAllSchedules();
      const teachersData = await teacherService.getAllTeachers();
      setAllSchedules(schedulesData);
      
      const uniqueVersions = Array.from(new Set(schedulesData.map(s => s.versionName || 'Mặc định'))).sort().reverse();
      setVersions(uniqueVersions);
      if (uniqueVersions.length > 0 && !selectedVersion) {
        setSelectedVersion(uniqueVersions[0]); 
      }

      // Loại bỏ tài khoản rác
      const validTeachers = teachersData.filter(t => t.name !== 'nguyendongnam261189@gmail.com' && t.name !== 'Chưa rõ');
      
      const sortedTeachers = validTeachers.sort((a, b) => {
          // Đưa người dùng hiện tại lên đầu tiên
          if ((role !== 'admin' && role !== 'manager') && teacherName) {
              if (a.name === teacherName) return -1;
              if (b.name === teacherName) return 1;
          }
          // Sắp xếp A-Z theo tên chuẩn Tiếng Việt
          const nameA = String(a.name).split(' ').pop() || '';
          const nameB = String(b.name).split(' ').pop() || '';
          return nameA.localeCompare(nameB, 'vi');
      });
      
      setTeachers(sortedTeachers);
    };
    fetchData();
  }, [role, department, teacherName]);

  const schedules = useMemo(() => {
    return allSchedules.filter(s => (s.versionName || 'Mặc định') === selectedVersion);
  }, [allSchedules, selectedVersion]);

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

  // Lọc giáo viên để hiển thị trên Danh bạ
  const filteredTeachers = useMemo(() => {
    return teachers.filter(t => {
      // Logic 1: Chỉ hiện giáo viên có lịch trong TKB này (Trừ Admin thấy hết)
      const hasScheduleInVersion = schedules.some(s => s.giao_vien === t.name);
      if (!hasScheduleInVersion && role !== 'admin' && role !== 'manager') return false;

      // Logic 2: Khớp tìm kiếm (Tên hoặc SĐT)
      const matchSearch = String(t.name).toLowerCase().includes(searchQuery.toLowerCase()) || 
                          String(t.phone || '').includes(searchQuery);
                          
      // Logic 3: Khớp Tổ chuyên môn
      const matchGroup = filterGroup ? t.group === filterGroup : true;
      
      // Logic 4: Khớp Buổi dạy
      let matchSession = true;
      const sessions = teacherSessions.get(t.name) || { sang: false, chieu: false };
      if (filterSession === 'Sáng') matchSession = sessions.sang && !sessions.chieu; 
      else if (filterSession === 'Chiều') matchSession = !sessions.sang && sessions.chieu; 
      else if (filterSession === 'Cả ngày') matchSession = sessions.sang && sessions.chieu;  

      return matchSearch && matchGroup && matchSession;
    });
  }, [teachers, schedules, searchQuery, filterGroup, filterSession, teacherSessions, role]);

  // 🔥 LUẬT BẢO MẬT: Ai được xem TKB của ai?
  const canViewSchedule = (targetTeacherName: string, targetTeacherGroup?: string) => {
    if (role === 'admin' || role === 'manager') return true; // Lãnh đạo xem tất cả
    if (teacherName === targetTeacherName) return true; // Tự xem của mình
    if (department && department !== 'undefined' && department === targetTeacherGroup) return true; // Xem cùng tổ
    return false; // Khác tổ -> Cấm
  };

  const formatZaloLink = (phone?: string) => {
    if (!phone) return '#';
    let cleanPhone = phone.replace(/[\s.-]/g, '');
    if (cleanPhone.startsWith('0')) {
      cleanPhone = '84' + cleanPhone.substring(1);
    }
    return `https://zalo.me/${cleanPhone}`;
  };

  // HÀM VẼ BẢNG TKB (Giữ nguyên logic cực xịn của Thầy)
  const renderScheduleGrid = (targetTeacherName: string) => {
    const teacherSchedules = schedules.filter(s => s.giao_vien === targetTeacherName);
    const days = [2, 3, 4, 5, 6, 7];
    let rowDefs: { tiet: number, buoi: 'Sáng' | 'Chiều' }[] = [];
    if (filterSession === 'Sáng' || filterSession === '' || filterSession === 'Cả ngày') {
      for (let i = 1; i <= 5; i++) rowDefs.push({ tiet: i, buoi: 'Sáng' });
    }
    if (filterSession === 'Chiều' || filterSession === '' || filterSession === 'Cả ngày') {
      for (let i = 1; i <= 5; i++) rowDefs.push({ tiet: i, buoi: 'Chiều' });
    }

    return (
      <div className="animate-in slide-in-from-right-4 duration-300">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-4 gap-4">
          <h3 className="text-xl font-bold text-indigo-800 flex items-center">
            <Calendar className="w-6 h-6 mr-2" /> 
            TKB: {targetTeacherName} 
            <span className="text-sm font-medium text-indigo-500 ml-2 bg-indigo-50 px-2 py-1 rounded-lg">({selectedVersion})</span>
          </h3>
          <button 
            onClick={() => setViewingScheduleFor(null)}
            className="w-full md:w-auto flex justify-center items-center text-sm text-white bg-gray-700 hover:bg-gray-800 px-5 py-2.5 rounded-xl transition-colors font-bold shadow-sm"
          >
            <ChevronLeft className="w-4 h-4 mr-1" /> Quay lại Danh bạ
          </button>
        </div>

        <div className="overflow-x-auto bg-white rounded-xl shadow-sm border border-gray-200">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 md:px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider border-r whitespace-nowrap">Tiết \ Thứ</th>
                {days.map(day => (
                  <th key={day} className="px-3 md:px-4 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-wider border-r">T{day}</th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {rowDefs.map((row) => (
                <tr key={`${row.buoi}-${row.tiet}`} className={row.buoi === 'Sáng' && row.tiet === 5 && (filterSession === '' || filterSession === 'Cả ngày') ? 'border-b-4 border-gray-300' : ''}>
                  <td className="px-3 md:px-4 py-3 whitespace-nowrap text-xs md:text-sm font-bold text-gray-700 border-r bg-gray-50">
                    Tiết {row.tiet} <span className="text-gray-400 font-medium hidden md:inline">({row.buoi})</span>
                    <span className="text-gray-400 font-medium md:hidden">{row.buoi === 'Sáng' ? ' (S)' : ' (C)'}</span>
                  </td>
                  {days.map(day => {
                    const slot = teacherSchedules.find(s => s.thu === day && s.tiet === row.tiet && s.buoi === row.buoi);
                    const cleanPhong = slot?.phong ? String(slot.phong).trim() : '';
                    const hasRoom = cleanPhong !== '' && cleanPhong.toLowerCase() !== 'null' && cleanPhong.toLowerCase() !== 'undefined';
                    return (
                      <td key={`${day}-${row.buoi}-${row.tiet}`} className={`px-1 md:px-4 py-2 md:py-3 whitespace-nowrap text-sm text-center border-r ${slot ? 'bg-indigo-50/50' : 'bg-gray-50/30'}`}>
                        {slot ? (
                          <div className="flex flex-col items-center">
                            <span className="font-bold text-indigo-700 text-xs md:text-sm">
                              {String(slot.lop).replace(/\./g, '/')}
                            </span>
                            <span className="text-[10px] md:text-xs text-gray-600 mt-0.5">{slot.mon}</span>
                            {hasRoom && <span className="text-[10px] text-gray-500 font-medium mt-0.5 bg-white px-1.5 rounded border border-gray-200 shadow-sm">P.{cleanPhong}</span>}
                          </div>
                        ) : <span className="text-gray-300 text-xs italic">-</span>}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-10">
      
      {/* CẢNH BÁO CHO TÀI KHOẢN CHƯA HOÀN THIỆN */}
      {(isOrphanTeacher || isMissingLink) && (
        <div className="flex items-start p-4 bg-yellow-50 rounded-xl border border-yellow-200 shadow-sm">
          <AlertCircle className="w-6 h-6 text-yellow-600 mr-3 shrink-0 mt-0.5" />
          <div>
            <h3 className="font-bold text-yellow-800 text-sm">Tài khoản chưa hoàn thiện</h3>
            <p className="text-yellow-700 text-sm mt-1">
              Bạn <strong>{isOrphanTeacher ? "chưa được gắn Tổ chuyên môn" : "chưa liên kết với Tên TKB"}</strong>. 
              Bạn vẫn có thể tra cứu Danh bạ, nhưng tính năng Xem Thời khóa biểu của tổ sẽ bị hạn chế. Vui lòng báo Admin cập nhật.
            </p>
          </div>
        </div>
      )}

      {/* HEADER & THANH CÔNG CỤ */}
      {!viewingScheduleFor && (
        <div className="bg-white p-4 md:p-6 rounded-2xl shadow-sm border border-gray-200">
          <div className="flex flex-col lg:flex-row justify-between lg:items-center mb-6 border-b pb-4 border-gray-100 gap-4">
            <div>
              <h2 className="text-xl md:text-2xl font-bold text-gray-800 flex items-center">
                <PhoneCall className="mr-3 text-indigo-600 w-6 h-6 md:w-8 md:h-8" /> Danh bạ & Thời khóa biểu
              </h2>
              <p className="text-gray-500 text-sm mt-1">
                {(role === 'admin' || role === 'manager') 
                  ? 'Tra cứu liên lạc và Thời khóa biểu của toàn trường.' 
                  : 'Tra cứu liên lạc toàn trường và Xem TKB nội bộ tổ.'}
              </p>
            </div>
            
            <div className="flex items-center bg-indigo-50 p-2 rounded-xl border border-indigo-100 shadow-sm">
              <span className="text-indigo-700 font-bold text-xs md:text-sm mr-2 flex items-center shrink-0">
                <Layers className="w-4 h-4 mr-1" /> Bản TKB:
              </span>
              <select 
                className="bg-white border-none rounded-lg text-sm font-bold text-gray-800 focus:ring-2 focus:ring-indigo-500 py-1.5 px-3 min-w-[120px] md:min-w-[150px] outline-none"
                value={selectedVersion}
                onChange={(e) => {
                  setSelectedVersion(e.target.value);
                  setExpandedTeacherId(null);
                }}
              >
                {versions.map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5" />
              <input
                type="text"
                placeholder="Tìm tên, SĐT..."
                className="pl-10 pr-4 py-2.5 w-full border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            <select
              className="px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm bg-white"
              value={filterGroup}
              onChange={(e) => setFilterGroup(e.target.value)}
            >
              <option value="">Tất cả Tổ chuyên môn</option>
              {Array.from(new Set(teachers.map(t => t.group))).filter(Boolean).sort().map(grp => (
                <option key={grp} value={grp}>{grp}</option>
              ))}
            </select>

            <select
              className="px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm bg-white"
              value={filterSession}
              onChange={(e) => {
                setFilterSession(e.target.value);
                setExpandedTeacherId(null);
              }}
            >
              <option value="">Tất cả các buổi</option>
              <option value="Sáng">Chỉ dạy Sáng</option>
              <option value="Chiều">Chỉ dạy Chiều</option>
              <option value="Cả ngày">Dạy cả Sáng & Chiều</option>
            </select>
          </div>
        </div>
      )}

      {/* KHU VỰC HIỂN THỊ (LƯỚI THẺ HOẶC BẢNG TKB) */}
      {viewingScheduleFor ? (
        renderScheduleGrid(viewingScheduleFor)
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 animate-in fade-in duration-300">
          {filteredTeachers.map((teacher) => {
            const isExpanded = expandedTeacherId === teacher.name;
            const showTkbButton = canViewSchedule(teacher.name, teacher.group);
            const isMe = teacherName === teacher.name;

            return (
              <div 
                key={teacher.id || teacher.name} 
                className={`bg-white rounded-2xl shadow-sm border transition-all overflow-hidden flex flex-col cursor-pointer
                  ${isExpanded ? 'border-indigo-400 ring-2 ring-indigo-100 shadow-md' : 'border-gray-200 hover:border-indigo-300 hover:shadow-md'}
                  ${isMe ? 'bg-indigo-50/30' : ''}
                `}
                onClick={() => !isExpanded && setExpandedTeacherId(teacher.name)}
              >
                {/* Phần Header Thẻ (Luôn hiện) */}
                <div className="p-4 flex items-start">
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center font-black text-xl shadow-inner shrink-0 mr-3
                    ${isMe ? 'bg-gradient-to-br from-indigo-500 to-indigo-600 text-white' : 'bg-gradient-to-br from-indigo-100 to-indigo-200 text-indigo-700'}
                  `}>
                    {String(teacher.name).split(' ').pop()?.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-gray-900 text-base flex items-center">
                      <span className="truncate">{teacher.name}</span>
                      {isMe && <span className="ml-2 shrink-0 bg-indigo-600 text-white text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded-full">Bạn</span>}
                    </h3>
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-gray-100 text-gray-500 border border-gray-200">
                        {teacher.group || 'Chưa phân tổ'}
                      </span>
                      {teacher.subject && (
                        <span className="text-[10px] font-medium px-2 py-0.5 rounded bg-indigo-50 text-indigo-600 border border-indigo-100 truncate max-w-full" title={teacher.subject}>
                          {teacher.subject}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Phần Mở rộng (Chỉ hiện khi bấm vào) */}
                {isExpanded && (
                  <div className="px-4 pb-4 pt-2 border-t border-gray-100 bg-gray-50/50 animate-in slide-in-from-top-2 duration-200">
                    
                    {/* Số điện thoại */}
                    {teacher.phone ? (
                      <>
                        <div className="text-center py-2.5 mb-3 bg-white rounded-xl border border-gray-200 shadow-sm">
                          <span className="font-black text-xl text-gray-800 tracking-wider">{teacher.phone}</span>
                        </div>
                        
                        {/* 3 Nút Liên lạc */}
                        <div className="grid grid-cols-3 gap-2 mb-3">
                          <a 
                            href={`tel:${teacher.phone}`}
                            onClick={(e) => e.stopPropagation()}
                            className="flex flex-col items-center justify-center bg-emerald-500 hover:bg-emerald-600 text-white py-2 rounded-xl transition-colors shadow-sm active:scale-95"
                          >
                            <Phone className="w-5 h-5 mb-1" />
                            <span className="text-[10px] font-bold">Gọi điện</span>
                          </a>
                          <a 
                            href={formatZaloLink(teacher.phone)}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="flex flex-col items-center justify-center bg-[#0068FF] hover:bg-blue-600 text-white py-2 rounded-xl transition-colors shadow-sm active:scale-95"
                          >
                            <MessageCircle className="w-5 h-5 mb-1" />
                            <span className="text-[10px] font-bold">Nhắn Zalo</span>
                          </a>
                          <a 
                            href={formatZaloLink(teacher.phone)}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="flex flex-col items-center justify-center bg-[#0068FF] hover:bg-blue-600 text-white py-2 rounded-xl transition-colors shadow-sm active:scale-95"
                          >
                            <Video className="w-5 h-5 mb-1" />
                            <span className="text-[10px] font-bold">Gọi Zalo</span>
                          </a>
                        </div>
                      </>
                    ) : (
                      <div className="text-center py-3 mb-3 bg-gray-100 rounded-xl border border-dashed border-gray-300 text-sm text-gray-500 font-medium">
                        Chưa có số điện thoại
                      </div>
                    )}

                    {/* Nút Xem Thời khóa biểu */}
                    {showTkbButton ? (
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          setViewingScheduleFor(teacher.name);
                        }}
                        className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2.5 rounded-xl transition-all shadow-sm active:scale-[0.98] flex items-center justify-center text-sm"
                      >
                        <Calendar className="w-4 h-4 mr-2" /> Xem Thời khóa biểu
                      </button>
                    ) : (
                      <div className="text-center py-2 bg-gray-100 rounded-xl text-xs text-gray-400 font-medium">
                        (Không có quyền xem TKB)
                      </div>
                    )}

                    {/* Nút đóng */}
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        setExpandedTeacherId(null);
                      }}
                      className="w-full text-center text-xs text-gray-400 hover:text-gray-600 font-medium py-2 mt-1"
                    >
                      Thu gọn lại
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {filteredTeachers.length === 0 && !viewingScheduleFor && (
        <div className="text-center py-16 bg-white rounded-2xl border border-dashed border-gray-300">
          <Users className="w-16 h-16 text-gray-200 mx-auto mb-4" />
          <p className="text-lg font-bold text-gray-500">Không tìm thấy giáo viên</p>
          <p className="text-sm text-gray-400 mt-1">Hãy thử bỏ bớt bộ lọc hoặc kiểm tra lại từ khóa tìm kiếm.</p>
        </div>
      )}
    </div>
  );
};

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Schedule, Teacher } from '../types';
import { scheduleService } from '../services/scheduleService';
import { teacherService } from '../services/teacherService';
import { Search, Calendar, Copy, Check } from 'lucide-react';
import html2canvas from 'html2canvas';

export const TeacherView: React.FC = () => {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [searchName, setSearchName] = useState('');
  const [selectedTeacher, setSelectedTeacher] = useState<string | null>(null);
  const [filterSubject, setFilterSubject] = useState('');
  const [filterGroup, setFilterGroup] = useState('');
  const [filterSession, setFilterSession] = useState('');

  // Ngày áp dụng TKB (mặc định là ngày hiện tại)
  const [applyDate, setApplyDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [isCopying, setIsCopying] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
  const scheduleRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fetchData = async () => {
      const allSchedules = await scheduleService.getAllSchedules();
      const allTeachers = await teacherService.getAllTeachers();
      setSchedules(allSchedules);
      setTeachers(allTeachers);
    };
    fetchData();
  }, []);

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

  const filteredTeachers = teachers.filter(t => {
    const matchName = t.name.toLowerCase().includes(searchName.toLowerCase());
    const matchSubject = filterSubject ? t.subject.split(', ').includes(filterSubject) : true;
    const matchGroup = filterGroup ? t.group === filterGroup : true;
    
    let matchSession = true;
    const sessions = teacherSessions.get(t.name) || { sang: false, chieu: false };

    if (filterSession === 'Sáng') {
      matchSession = sessions.sang && !sessions.chieu; 
    } else if (filterSession === 'Chiều') {
      matchSession = !sessions.sang && sessions.chieu; 
    } else if (filterSession === 'Cả ngày') {
      matchSession = sessions.sang && sessions.chieu;  
    }

    return matchName && matchSubject && matchGroup && matchSession;
  });

  const getScheduleForTeacher = (teacherName: string) => {
    return schedules.filter(s => s.giao_vien === teacherName);
  };

  const formatDateVN = (dateString: string) => {
    if (!dateString) return '';
    const [year, month, day] = dateString.split('-');
    return `${day}/${month}/${year}`;
  };

  const handleCopyImage = async () => {
    if (!scheduleRef.current) return;
    setIsCopying(true);
    setCopySuccess(false);
    
    try {
      // Chụp ảnh phần tử DOM
      const canvas = await html2canvas(scheduleRef.current, {
        backgroundColor: '#ffffff',
        scale: 2, // Tăng độ phân giải ảnh lên gấp đôi cho nét
      });

      canvas.toBlob(async (blob) => {
        if (blob) {
          try {
            // Thử copy vào Clipboard (Để dán thẳng vào Zalo)
            const item = new ClipboardItem({ 'image/png': blob });
            await navigator.clipboard.write([item]);
            setCopySuccess(true);
            setTimeout(() => setCopySuccess(false), 3000);
          } catch (clipboardError) {
            console.error('Lỗi clipboard, chuyển sang tải file:', clipboardError);
            // Nếu trình duyệt chặn không cho copy, sẽ tự động tải file ảnh về máy
            const link = document.createElement('a');
            link.download = `TKB_${selectedTeacher}_${applyDate}.png`;
            link.href = canvas.toDataURL('image/png');
            link.click();
            alert('Trình duyệt không hỗ trợ copy trực tiếp. Đã tải ảnh về máy của thầy/cô!');
          }
        }
      });
    } catch (error) {
      console.error('Lỗi khi tạo ảnh:', error);
      alert('Có lỗi xảy ra khi tạo ảnh. Vui lòng thử lại.');
    } finally {
      setIsCopying(false);
    }
  };

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
      <div className="overflow-x-auto mt-4 rounded-xl shadow-sm border border-gray-200">
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
              <tr key={`${row.buoi}-${row.tiet}`} className={row.buoi === 'Sáng' && row.tiet === 5 && (filterSession === '' || filterSession === 'Cả ngày') ? 'border-b-4 border-gray-300' : ''}>
                <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900 border-r bg-gray-50">
                  Tiết {row.tiet} ({row.buoi})
                </td>
                {days.map(day => {
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
            onChange={(e) => {
              setFilterSession(e.target.value);
              setSelectedTeacher(null); 
            }}
          >
            <option value="">Tất cả các buổi</option>
            <option value="Sáng">Chỉ dạy Sáng</option>
            <option value="Chiều">Chỉ dạy Chiều</option>
            <option value="Cả ngày">Dạy cả Sáng & Chiều</option>
          </select>
        </div>

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
            {filteredTeachers.length === 0 && (
              <div className="col-span-full text-center py-8 text-gray-500">
                Không tìm thấy giáo viên nào phù hợp với điều kiện lọc.
              </div>
            )}
          </div>
        )}

        {selectedTeacher && (
          <div className="animate-in fade-in duration-300">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-4 gap-4">
              <button 
                onClick={() => setSelectedTeacher(null)}
                className="text-sm text-gray-600 hover:text-indigo-600 underline"
              >
                ← Trở lại danh sách
              </button>

              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2 bg-gray-50 px-3 py-1.5 rounded-lg border border-gray-200">
                  <span className="text-sm text-gray-600 font-medium">Ngày áp dụng:</span>
                  <input 
                    type="date" 
                    value={applyDate}
                    onChange={(e) => setApplyDate(e.target.value)}
                    className="text-sm border-none bg-transparent focus:ring-0 text-indigo-700 font-bold p-0"
                  />
                </div>
                
                <button
                  onClick={handleCopyImage}
                  disabled={isCopying}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors ${
                    copySuccess ? 'bg-green-500 hover:bg-green-600' : 'bg-indigo-600 hover:bg-indigo-700'
                  }`}
                >
                  {isCopying ? (
                    <span className="animate-pulse">Đang tạo ảnh...</span>
                  ) : copySuccess ? (
                    <>
                      <Check className="w-4 h-4" /> Đã Copy thành công!
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" /> Copy Ảnh (Gửi Zalo)
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* VÙNG CHỤP ẢNH - Mọi thứ bên trong ref này sẽ xuất hiện trong ảnh */}
            <div ref={scheduleRef} className="bg-white p-6 border-2 border-indigo-100 rounded-xl">
              <div className="text-center mb-4">
                <h3 className="text-2xl font-bold text-indigo-800 uppercase">
                  Thời khóa biểu - {selectedTeacher}
                </h3>
                <p className="text-gray-600 mt-1 italic">
                  Áp dụng từ ngày: <span className="font-semibold text-indigo-600">{formatDateVN(applyDate)}</span>
                </p>
              </div>
              
              {renderScheduleGrid(getScheduleForTeacher(selectedTeacher))}
              
              <div className="mt-4 flex justify-between text-xs text-gray-400 italic">
                <span>Trích xuất từ Hệ thống TKB Manager</span>
                <span>Ngày tạo: {formatDateVN(new Date().toISOString().split('T')[0])}</span>
              </div>
            </div>
            {/* KẾT THÚC VÙNG CHỤP ẢNH */}
            
          </div>
        )}
      </div>
    </div>
  );
};

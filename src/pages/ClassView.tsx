import React, { useState, useEffect, useMemo } from 'react';
import { Schedule } from '../types';
import { scheduleService } from '../services/scheduleService';
import { Search, Calendar, Layers, UserCheck } from 'lucide-react';

export const ClassView: React.FC = () => {
  const [allSchedules, setAllSchedules] = useState<Schedule[]>([]);
  const [searchClass, setSearchClass] = useState('');
  const [selectedClass, setSelectedClass] = useState<string | null>(null);
  const [filterSession, setFilterSession] = useState('');

  // STATES CHO ĐA PHIÊN BẢN
  const [versions, setVersions] = useState<string[]>([]);
  const [selectedVersion, setSelectedVersion] = useState<string>('');

  useEffect(() => {
    const fetchData = async () => {
      const schedulesData = await scheduleService.getAllSchedules();
      setAllSchedules(schedulesData);
      
      const uniqueVersions = Array.from(new Set(schedulesData.map(s => s.versionName || 'Mặc định'))).sort().reverse();
      setVersions(uniqueVersions);
      
      if (uniqueVersions.length > 0 && !selectedVersion) {
        setSelectedVersion(uniqueVersions[0]); 
      }
    };
    fetchData();
  }, []);

  const currentSchedules = useMemo(() => {
    return allSchedules.filter(s => (s.versionName || 'Mặc định') === selectedVersion);
  }, [allSchedules, selectedVersion]);

  const classes = useMemo(() => {
    const classSet = new Set<string>();
    currentSchedules.forEach(s => {
      if (s.lop) {
        s.lop.split(', ').forEach(c => classSet.add(c.trim()));
      }
    });
    return Array.from(classSet).filter(Boolean).sort((a, b) => a.localeCompare(b, 'vi', { numeric: true }));
  }, [currentSchedules]);

  const filteredClasses = classes.filter(c => 
    c.toLowerCase().includes(searchClass.toLowerCase())
  );

  const getScheduleForClass = (className: string) => {
    return currentSchedules.filter(s => 
      s.lop.split(', ').map(c => c.trim()).includes(className) && 
      (filterSession ? s.buoi === filterSession : true)
    );
  };

  // 🔥 THUẬT TOÁN DÒ TÌM GIÁO VIÊN CHỦ NHIỆM TỰ ĐỘNG
  const getHomeroomTeacher = (classSchedules: Schedule[]): string => {
    for (const s of classSchedules) {
      const mon = (s.mon || '').toUpperCase();
      if ((mon.includes('HDTN') || mon.includes('HĐTN') || mon.includes('CHÀO CỜ') || mon.includes('CC-') || mon.includes('SHL') || mon.includes('SINH HOẠT')) 
          && s.giao_vien !== 'Chưa rõ') {
        return s.giao_vien;
      }
    }
    return 'Chưa có thông tin';
  };

  const renderScheduleGrid = (classSchedules: Schedule[]) => {
    const days = [2, 3, 4, 5, 6, 7];
    let periods = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

    if (filterSession === 'Sáng') periods = [1, 2, 3, 4, 5];
    else if (filterSession === 'Chiều') periods = [6, 7, 8, 9, 10];

    return (
      <div className="overflow-x-auto mt-6 bg-white rounded-xl shadow-sm border border-gray-200">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider border-r">Tiết \ Thứ</th>
              {days.map(day => (
                <th key={day} className="px-4 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-wider border-r">Thứ {day}</th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {periods.map(period => (
              <tr key={period} className={period === 5 && filterSession === '' ? 'border-b-4 border-gray-300' : ''}>
                <td className="px-4 py-3 whitespace-nowrap text-sm font-bold text-gray-700 border-r bg-gray-50">
                  {/* 🔥 ĐÃ SỬA LẠI ĐÁNH SỐ TIẾT TỪ 6-10 THÀNH 1-5 CHO BUỔI CHIỀU */}
                  Tiết {period <= 5 ? period : period - 5} {period <= 5 ? '(Sáng)' : '(Chiều)'}
                </td>
                {days.map(day => {
                  const session = period <= 5 ? 'Sáng' : 'Chiều';
                  const adjustedPeriod = period <= 5 ? period : period - 5;
                  const slot = classSchedules.find(s => s.thu === day && s.tiet === adjustedPeriod && s.buoi === session);
                  const cleanPhong = slot?.phong ? String(slot.phong).trim() : '';
                  const hasRoom = cleanPhong !== '' && cleanPhong.toLowerCase() !== 'null' && cleanPhong.toLowerCase() !== 'undefined';

                  return (
                    <td key={`${day}-${period}`} className={`px-4 py-3 whitespace-nowrap text-sm text-center border-r ${slot ? 'bg-emerald-50' : 'bg-gray-100/50'}`}>
                      {slot ? (
                        <div className="flex flex-col items-center">
                          <span className="font-bold text-emerald-800 text-base">{slot.mon}</span>
                          <span className="text-xs font-medium text-emerald-950 mt-1">{slot.giao_vien}</span>
                          {hasRoom && <span className="text-[10px] text-gray-500 mt-0.5">P.{cleanPhong}</span>}
                        </div>
                      ) : <span className="text-gray-300 text-xs italic">Trống</span>}
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
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
        <div className="flex flex-col lg:flex-row justify-between lg:items-center mb-6 border-b pb-4 border-gray-100 gap-4">
          <h2 className="text-2xl font-bold text-gray-800 flex items-center">
            <Calendar className="mr-2 text-emerald-600 h-7 w-7" /> Tra cứu TKB theo Lớp
          </h2>

          <div className="flex items-center bg-emerald-50 p-2 rounded-xl border border-emerald-100 shadow-sm self-start lg:self-center">
            <span className="text-emerald-800 font-bold text-sm mr-3 flex items-center shrink-0">
              <Layers className="w-4 h-4 mr-1.5" /> Phiên bản:
            </span>
            <select 
              className="bg-white border-none rounded-lg text-sm font-bold text-gray-800 focus:ring-2 focus:ring-emerald-500 py-1.5 px-3 min-w-[150px] shadow-sm"
              value={selectedVersion}
              onChange={(e) => {
                setSelectedVersion(e.target.value);
                setSelectedClass(null); 
              }}
            >
              {versions.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5" />
            <input
              type="text"
              placeholder="Tìm tên lớp (VD: 6/11)..."
              className="pl-10 pr-4 py-2.5 w-full border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 text-sm font-medium"
              value={searchClass}
              onChange={(e) => setSearchClass(e.target.value)}
            />
          </div>

          <select
            className="px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 text-sm font-bold text-gray-700"
            value={filterSession}
            onChange={(e) => setFilterSession(e.target.value)}
          >
            <option value="">Cả ngày (Sáng & Chiều)</option>
            <option value="Sáng">Chỉ hiện Buổi Sáng</option>
            <option value="Chiều">Chỉ hiện Buổi Chiều</option>
          </select>
        </div>

        {!selectedClass && (
          <div className="grid grid-cols-3 md:grid-cols-6 lg:grid-cols-8 gap-3">
            {filteredClasses.map(className => (
              <button
                key={className}
                onClick={() => setSelectedClass(className)}
                className="p-3 text-sm font-bold text-emerald-900 bg-white border border-gray-200 rounded-xl shadow-sm hover:bg-emerald-50 hover:border-emerald-400 hover:shadow-md transition-all text-center"
              >
                {String(className).replace(/\./g, '/')}
              </button>
            ))}
            {filteredClasses.length === 0 && (
              <div className="col-span-full text-center py-12 text-gray-400 italic bg-gray-50 rounded-xl border border-dashed border-gray-200">
                Không có dữ liệu lớp học cho phiên bản này. Vui lòng tải file Excel lên.
              </div>
            )}
          </div>
        )}

        {selectedClass && (
          <div className="animate-in slide-in-from-right-4 duration-300">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-4 gap-4 bg-emerald-50 p-4 rounded-xl border border-emerald-100">
              
              <div>
                <h3 className="text-xl font-black text-emerald-800 flex items-center">
                  Lớp {String(selectedClass).replace(/\./g, '/')} 
                  <span className="text-sm font-medium text-emerald-600 bg-emerald-100 px-2 py-0.5 rounded ml-2 border border-emerald-200">
                    {selectedVersion}
                  </span>
                </h3>
                
                <div className="text-sm font-bold text-emerald-700 mt-1 flex items-center">
                  <UserCheck className="w-4 h-4 mr-1.5" />
                  GVCN: <span className="ml-1 text-emerald-950 uppercase">{getHomeroomTeacher(getScheduleForClass(selectedClass))}</span>
                </div>
              </div>

              <button 
                onClick={() => setSelectedClass(null)}
                className="text-sm text-white bg-gray-700 hover:bg-gray-800 px-5 py-2.5 rounded-lg transition-colors font-bold shadow whitespace-nowrap"
              >
                ← Trở lại danh sách Lớp
              </button>
            </div>
            {renderScheduleGrid(getScheduleForClass(selectedClass))}
          </div>
        )}
      </div>
    </div>
  );
};

import React, { useState, useEffect, useMemo } from 'react';
import { Schedule } from '../types';
import { scheduleService } from '../services/scheduleService';
import { Search, Calendar, Layers, UserCheck, Filter } from 'lucide-react';

export const ClassView: React.FC = () => {
  const [allSchedules, setAllSchedules] = useState<Schedule[]>([]);
  const [searchClass, setSearchClass] = useState('');
  const [selectedClass, setSelectedClass] = useState<string | null>(null);
  
  // 🔥 Đổi state lọc Sáng/Chiều thành lọc Khối
  const [filterGrade, setFilterGrade] = useState<string>('');

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

  // Lọc theo thanh tìm kiếm và theo Khối
  const filteredClasses = classes.filter(c => {
    const matchSearch = c.toLowerCase().includes(searchClass.toLowerCase());
    const matchGrade = filterGrade ? c.startsWith(filterGrade + '.') || c.startsWith(filterGrade + '/') : true;
    return matchSearch && matchGrade;
  });

  // Thuật toán gom nhóm Lớp theo Khối để render
  const groupedClasses = useMemo(() => {
    const groups: Record<string, string[]> = {};
    filteredClasses.forEach(c => {
      const grade = c.split(/[./]/)[0]; // Lấy số đầu tiên làm tên khối (VD: "6.11" -> "6")
      const groupName = `Khối ${grade}`;
      if (!groups[groupName]) groups[groupName] = [];
      groups[groupName].push(c);
    });
    
    // Sắp xếp tên khối (Khối 6 -> Khối 9)
    return Object.keys(groups).sort((a, b) => a.localeCompare(b, 'vi', { numeric: true })).map(key => ({
      grade: key,
      classes: groups[key]
    }));
  }, [filteredClasses]);

  const getScheduleForClass = (className: string) => {
    return currentSchedules.filter(s => 
      s.lop.split(', ').map(c => c.trim()).includes(className)
    );
  };

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
    // Hiển thị cả 10 tiết vì học cả ngày
    const periods = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

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
              <tr key={period} className={period === 5 ? 'border-b-4 border-gray-300' : ''}>
                <td className="px-4 py-3 whitespace-nowrap text-sm font-bold text-gray-700 border-r bg-gray-50">
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
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5" />
            <input
              type="text"
              placeholder="Tìm tên lớp (VD: 6/11)..."
              className="pl-10 pr-4 py-2.5 w-full border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 text-sm font-medium shadow-sm"
              value={searchClass}
              onChange={(e) => setSearchClass(e.target.value)}
            />
          </div>

          <div className="flex items-center gap-2">
            <Filter className="text-gray-400 w-5 h-5 ml-2 hidden md:block" />
            <select
              className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 text-sm font-bold text-gray-700 shadow-sm"
              value={filterGrade}
              onChange={(e) => setFilterGrade(e.target.value)}
            >
              <option value="">Hiển thị Tất cả các Khối</option>
              <option value="6">Chỉ xem Khối 6</option>
              <option value="7">Chỉ xem Khối 7</option>
              <option value="8">Chỉ xem Khối 8</option>
              <option value="9">Chỉ xem Khối 9</option>
            </select>
          </div>
        </div>

        {/* 🔥 DANH SÁCH LỚP ĐƯỢC NHÓM THEO KHỐI RẤT CHUYÊN NGHIỆP */}
        {!selectedClass && (
          <div className="space-y-8 animate-in fade-in duration-300">
            {groupedClasses.map(group => (
              <div key={group.grade} className="bg-gray-50 rounded-xl p-5 border border-gray-100">
                <div className="flex items-center mb-4 border-b border-gray-200 pb-2">
                  <h3 className="text-lg font-black text-gray-700">{group.grade}</h3>
                  <span className="ml-3 px-2.5 py-0.5 bg-emerald-100 text-emerald-700 text-xs font-bold rounded-full">
                    {group.classes.length} lớp
                  </span>
                </div>
                
                <div className="grid grid-cols-3 md:grid-cols-6 lg:grid-cols-8 gap-3">
                  {group.classes.map(className => (
                    <button
                      key={className}
                      onClick={() => setSelectedClass(className)}
                      className="p-3 text-sm font-bold text-emerald-900 bg-white border border-gray-200 rounded-xl shadow-sm hover:bg-emerald-50 hover:border-emerald-400 hover:shadow-md hover:-translate-y-0.5 transition-all text-center"
                    >
                      {String(className).replace(/\./g, '/')}
                    </button>
                  ))}
                </div>
              </div>
            ))}

            {groupedClasses.length === 0 && (
              <div className="text-center py-12 text-gray-400 italic bg-gray-50 rounded-xl border border-dashed border-gray-200">
                Không tìm thấy dữ liệu lớp học nào khớp với tìm kiếm của bạn.
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

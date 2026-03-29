import React, { useState, useEffect, useMemo } from 'react';
import { Schedule, Teacher } from '../types';
import { scheduleService } from '../services/scheduleService';
import { teacherService } from '../services/teacherService';
import { LayoutDashboard, Users, Presentation, BarChart3, Loader2, Search, Radar, Clock, Layers, Contact, Star } from 'lucide-react';

export const Dashboard: React.FC<{ role?: 'admin' | 'manager' | 'teacher' | 'ttcm' | null, department?: string | null }> = ({ role, department }) => {
  const [allSchedules, setAllSchedules] = useState<Schedule[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [loading, setLoading] = useState(true);

  const [searchQuery, setSearchQuery] = useState('');
  const [filterDept, setFilterDept] = useState('');

  const [versions, setVersions] = useState<string[]>([]);
  const [selectedVersion, setSelectedVersion] = useState<string>('');

  // Vá lỗi "Lời nguyền Chủ Nhật": Thứ Chủ Nhật (0) sẽ tự động gán là Thứ 2.
  const getInitialDay = () => {
    const today = new Date().getDay();
    return today === 0 ? 2 : today + 1;
  };

  const [radarDay, setRadarDay] = useState<number>(getInitialDay());
  const [radarSession, setRadarSession] = useState<'Sáng' | 'Chiều'>('Sáng');
  const [radarPeriod, setRadarPeriod] = useState<number>(1);
  const [radarDept, setRadarDept] = useState<string>(''); 

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [schedulesData, allTeachers] = await Promise.all([
          scheduleService.getAllSchedules(),
          teacherService.getAllTeachers()
        ]);

        setAllSchedules(schedulesData);

        const uniqueVersions = Array.from(new Set(schedulesData.map(s => s.versionName || 'Mặc định'))).sort().reverse();
        setVersions(uniqueVersions);
        if (uniqueVersions.length > 0 && !selectedVersion) {
          setSelectedVersion(uniqueVersions[0]);
        }

        // 🔥 TẤT CẢ VAI TRÒ ĐỀU THẤY TOÀN BỘ GIÁO VIÊN
        setTeachers(allTeachers);

      } catch (error) {
        console.error("Error fetching dashboard data:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  // 🔥 TẤT CẢ VAI TRÒ ĐỀU THẤY TOÀN BỘ LỊCH DẠY
  const schedules = useMemo(() => {
    return allSchedules.filter(s => (s.versionName || 'Mặc định') === selectedVersion);
  }, [allSchedules, selectedVersion]);

  const dynamicDepartments = useMemo(() => {
    return Array.from(new Set(teachers.map(t => t.group))).filter(Boolean).sort();
  }, [teachers]);

  const baseStats = useMemo(() => {
    if (loading) return null;

    const uniqueClasses = new Set(schedules.map(s => s.lop));

    const loadMap = new Map<string, number>();
    schedules.forEach(s => {
      loadMap.set(s.giao_vien, (loadMap.get(s.giao_vien) || 0) + 1);
    });

    const teacherLoads = teachers
      .filter(t => t.name !== 'nguyendongnam261189@gmail.com')
      .map(t => ({
        name: t.name,
        group: t.group || 'Chưa phân tổ',
        load: loadMap.get(t.name) || 0
      }));

    return {
      totalClasses: uniqueClasses.size,
      totalPeriods: schedules.length,
      teacherLoads
    };
  }, [loading, schedules, teachers]);

  const isHDTNType = (subject: string): boolean => {
    const s = (subject || '').toUpperCase();
    return s.includes('HDTN') || s.includes('HĐTN') || s.includes('CHÀO CỜ') || s.includes('CC-') || s.includes('SHL') || s.includes('SINH HOẠT');
  };

  const homeroomData = useMemo(() => {
    const mapping = new Map<string, string>(); 
    
    schedules.forEach(s => {
      if (isHDTNType(s.mon) && s.giao_vien !== 'Chưa rõ') {
        const classes = s.lop.split(',').map(c => c.trim()).filter(Boolean);
        classes.forEach(c => {
          mapping.set(c, s.giao_vien);
        });
      }
    });

    const result = Array.from(mapping.entries()).map(([className, teacherName]) => {
      const teacherInfo = teachers.find(t => t.name === teacherName);
      return {
        className,
        teacherName,
        group: teacherInfo?.group || 'Chưa rõ'
      };
    });

    return result.sort((a, b) => a.className.localeCompare(b.className, 'vi', { numeric: true }));
  }, [schedules, teachers]);

  const filteredHomerooms = useMemo(() => {
    return homeroomData.filter(item => {
      const matchSearch = item.className.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          item.teacherName.toLowerCase().includes(searchQuery.toLowerCase());
      const matchDept = filterDept ? item.group === filterDept : true;
      return matchSearch && matchDept;
    });
  }, [homeroomData, searchQuery, filterDept]);


  // ======================================================================
  // 🔥 RADAR TÌM GIÁO VIÊN TRỐNG
  // ======================================================================
  const freeTeachers = useMemo(() => {
    if (!baseStats) return [];
    
    const busyTeacherNames = new Set(
      schedules
        .filter(s => {
          const isSameDay = Number(s.thu) === Number(radarDay);
          const isSameSession = String(s.buoi).trim().toLowerCase() === String(radarSession).trim().toLowerCase();
          const isSamePeriod = Number(s.tiet) === Number(radarPeriod);
          return isSameDay && isSameSession && isSamePeriod;
        })
        .map(s => String(s.giao_vien).trim())
    );

    return baseStats.teacherLoads
      .filter(t => !busyTeacherNames.has(String(t.name).trim()))
      .filter(t => radarDept ? t.group === radarDept : true)
      .sort((a, b) => a.load - b.load);
  }, [schedules, baseStats, radarDay, radarSession, radarPeriod, radarDept]);

  // 🔥 THUẬT TOÁN GHIM TỔ CỦA USER LÊN ĐẦU (PIN TO TOP)
  const groupedFreeTeachers = useMemo(() => {
    const groups: Record<string, typeof freeTeachers> = {};
    freeTeachers.forEach(t => {
      const groupName = t.group || 'Chưa phân tổ';
      if (!groups[groupName]) groups[groupName] = [];
      groups[groupName].push(t);
    });
    
    return Object.keys(groups).sort((a, b) => {
      // 1. Nếu user có tổ, đưa tổ đó lên trên cùng
      if (department) {
        if (a === department) return -1;
        if (b === department) return 1;
      }
      // 2. Các tổ còn lại sắp xếp theo ABC
      return a.localeCompare(b, 'vi');
    }).map(groupName => ({
      group: groupName,
      teachers: groups[groupName],
      isMyDept: groupName === department // Cờ đánh dấu để tô màu UI
    }));
  }, [freeTeachers, department]);

  if (loading) return <div className="flex justify-center items-center h-64"><Loader2 className="h-8 w-8 text-indigo-600 animate-spin" /></div>;

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 sticky top-0 z-10">
        <div className="flex flex-col lg:flex-row justify-between lg:items-center gap-4">
          <div>
            <h2 className="text-2xl font-bold text-gray-800 flex items-center mb-1">
              <LayoutDashboard className="mr-2.5 text-indigo-600 h-7 w-7" /> 
              Trạm Chỉ Huy & Thống Kê Toàn Trường
            </h2>
            <p className="text-sm text-gray-500 mt-1">Góc nhìn tổng thể giúp điều phối nhân sự và nắm bắt tình hình thực tế.</p>
          </div>

          <div className="flex items-center bg-indigo-50 p-2 rounded-xl border border-indigo-100 shadow-sm self-start lg:self-center">
            <span className="text-indigo-700 font-bold text-sm mr-3 flex items-center shrink-0">
              <Layers className="w-4 h-4 mr-1.5" /> Phiên bản:
            </span>
            <select 
              className="bg-white border-none rounded-lg text-sm font-bold text-gray-800 focus:ring-2 focus:ring-indigo-500 py-1.5 px-3 min-w-[150px]"
              value={selectedVersion}
              onChange={(e) => setSelectedVersion(e.target.value)}
            >
              {versions.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-xl shadow-sm border border-indigo-100 flex items-center space-x-4">
          <div className="bg-indigo-100 p-3 rounded-full text-indigo-600"><Users className="w-6 h-6" /></div>
          <div><p className="text-xs font-medium text-gray-500 uppercase">Giáo viên</p><p className="text-2xl font-extrabold text-indigo-950">{teachers.length}</p></div>
        </div>
        <div className="bg-white p-5 rounded-xl shadow-sm border border-sky-100 flex items-center space-x-4">
          <div className="bg-sky-100 p-3 rounded-full text-sky-600"><Presentation className="w-6 h-6" /></div>
          <div><p className="text-xs font-medium text-gray-500 uppercase">Lớp học</p><p className="text-2xl font-extrabold text-sky-950">{baseStats?.totalClasses || 0}</p></div>
        </div>
        <div className="bg-white p-5 rounded-xl shadow-sm border border-amber-100 flex items-center space-x-4">
          <div className="bg-amber-100 p-3 rounded-full text-amber-600"><BarChart3 className="w-6 h-6" /></div>
          <div><p className="text-xs font-medium text-gray-500 uppercase">Tổng Tiết / Tuần</p><p className="text-2xl font-extrabold text-amber-950">{baseStats?.totalPeriods || 0}</p></div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* DANH BẠ GIÁO VIÊN CHỦ NHIỆM */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 flex flex-col h-[600px]">
          <div className="flex items-center mb-5 border-b pb-3 border-gray-100">
            <Contact className="w-5 h-5 mr-2 text-indigo-500"/><h3 className="text-lg font-bold text-gray-900">Danh bạ Giáo viên Chủ nhiệm</h3>
          </div>
          <div className="flex gap-3 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
              <input type="text" placeholder="Gõ tên lớp (VD: 6/11) hoặc Tên GV..." className="pl-9 pr-3 py-2 w-full border border-gray-300 rounded-lg text-sm" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
            </div>
            {/* 🔥 ĐÃ MỞ KHÓA CHO MỌI ROLE CÓ THỂ LỌC THEO TỔ */}
            <select className="px-3 py-2 border border-gray-300 rounded-lg text-sm w-40" value={filterDept} onChange={(e) => setFilterDept(e.target.value)}>
              <option value="">Toàn trường</option>
              {dynamicDepartments.map(dept => <option key={dept} value={dept}>{dept}</option>)}
            </select>
          </div>
          
          <div className="bg-indigo-50 px-4 py-2 rounded-t-lg border border-indigo-100 flex items-center text-xs font-bold text-indigo-700 uppercase">
            <div className="w-8 text-center">STT</div>
            <div className="w-20 px-2 text-center">Lớp</div>
            <div className="flex-1 px-2">Họ Tên GVCN</div>
          </div>
          
          <div className="flex-1 overflow-y-auto border-x border-b border-gray-200 rounded-b-lg divide-y divide-gray-100">
            {filteredHomerooms.length > 0 ? filteredHomerooms.map((item, index) => (
              <div key={item.className} className="flex items-center px-4 py-3 hover:bg-indigo-50/50 transition-colors">
                <div className="w-8 text-center text-sm text-gray-400">{index + 1}</div>
                <div className="w-20 px-2 text-center font-extrabold text-indigo-600 text-sm">
                  <span className="bg-white border border-indigo-200 px-2 py-1 rounded shadow-sm">{item.className}</span>
                </div>
                <div className="flex-1 px-2 font-bold text-gray-800 text-sm">
                  {item.teacherName} 
                  <span className="block text-[10px] font-normal text-gray-500 mt-0.5">{item.group}</span>
                </div>
              </div>
            )) : (
              <div className="text-center py-8 text-gray-500 italic text-sm">Chưa có dữ liệu Chủ nhiệm (Dựa trên tiết HĐTN/SHL/Chào cờ).</div>
            )}
          </div>
        </div>

        {/* RADAR TÌM GIÁO VIÊN TRỐNG */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-emerald-200 flex flex-col h-[600px]">
          <div className="flex items-center mb-5 border-b pb-3 border-emerald-100">
            <Radar className="w-5 h-5 mr-2 text-emerald-500"/><h3 className="text-lg font-bold text-gray-900">Radar Tìm giáo viên trống</h3>
          </div>
          
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
            <select className="px-2 py-2 border border-emerald-200 rounded-lg text-xs font-bold text-emerald-900 bg-emerald-50" value={radarDay} onChange={(e) => setRadarDay(Number(e.target.value))}>
              {[2,3,4,5,6,7].map(d => <option key={d} value={d}>Thứ {d}</option>)}
            </select>
            <select className="px-2 py-2 border border-emerald-200 rounded-lg text-xs font-bold text-emerald-900 bg-emerald-50" value={radarSession} onChange={(e) => setRadarSession(e.target.value as any)}>
              <option value="Sáng">Sáng</option><option value="Chiều">Chiều</option>
            </select>
            <select className="px-2 py-2 border border-emerald-200 rounded-lg text-xs font-bold text-emerald-900 bg-emerald-50" value={radarPeriod} onChange={(e) => setRadarPeriod(Number(e.target.value))}>
              {[1,2,3,4,5].map(p => <option key={p} value={p}>Tiết {p}</option>)}
            </select>
            
            {/* 🔥 ĐÃ MỞ KHÓA CHO MỌI ROLE CÓ THỂ LỌC THEO TỔ */}
            <select className="px-2 py-2 border border-emerald-200 rounded-lg text-xs font-bold text-emerald-900 bg-emerald-50" value={radarDept} onChange={(e) => setRadarDept(e.target.value)}>
              <option value="">Tất cả tổ</option>
              {dynamicDepartments.map(dept => <option key={dept} value={dept}>{dept}</option>)}
            </select>
          </div>

          <div className="bg-emerald-600 px-4 py-2 rounded-t-lg flex text-xs font-bold text-white uppercase shadow-sm">
            <div className="flex-1">GV Khả dụng ({freeTeachers.length})</div>
            <div className="w-16 text-right">Tổng tiết</div>
          </div>
          
          <div className="flex-1 overflow-y-auto border-x border-b border-emerald-200 rounded-b-lg bg-gray-50/50">
            {groupedFreeTeachers.length > 0 ? groupedFreeTeachers.map(group => (
              <div key={group.group} className="mb-3 last:mb-0">
                {/* 🔥 HIGHLIGHT TỔ NHÀ NẾU TRÙNG KHỚP */}
                <div className={`px-4 py-2 text-xs font-bold border-y sticky top-0 backdrop-blur-sm z-10 flex justify-between ${group.isMyDept ? 'bg-amber-100/90 text-amber-900 border-amber-200 shadow-sm' : 'bg-emerald-100/80 text-emerald-900 border-emerald-200'}`}>
                  <span className="flex items-center">
                    {group.isMyDept && <Star className="w-3.5 h-3.5 mr-1 text-amber-500 fill-amber-500" />}
                    {group.group} {group.isMyDept && '(Tổ của bạn)'}
                  </span>
                  <span className={`${group.isMyDept ? 'bg-amber-200 text-amber-800' : 'bg-emerald-200 text-emerald-800'} px-2 rounded-full`}>
                    {group.teachers.length}
                  </span>
                </div>
                
                <div className="divide-y divide-emerald-50 border-b border-emerald-100">
                  {group.teachers.map(t => (
                    <div key={t.name} className={`flex items-center justify-between px-4 py-2.5 transition-colors ${group.isMyDept ? 'bg-amber-50/30 hover:bg-amber-50' : 'bg-white hover:bg-emerald-50'}`}>
                      <div className="font-bold text-gray-800 text-sm pl-2">{t.name}</div>
                      <div className={`flex items-center font-bold px-2.5 py-1 rounded text-sm shadow-sm ${group.isMyDept ? 'text-amber-800 bg-amber-100' : 'text-emerald-700 bg-emerald-100'}`}>
                        <Clock className="w-3.5 h-3.5 mr-1" />{t.load}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )) : (
              <div className="text-center py-10 text-emerald-600 italic text-sm">
                Tất cả giáo viên đều bận vào tiết này.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

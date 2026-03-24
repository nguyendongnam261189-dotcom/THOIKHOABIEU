import React, { useState, useEffect, useMemo } from 'react';
import { Schedule, Teacher } from '../types';
import { scheduleService } from '../services/scheduleService';
import { teacherService } from '../services/teacherService';
import { LayoutDashboard, Users, Presentation, Building2, BarChart3, Loader2, Search, Filter, Radar, Clock } from 'lucide-react';

export const Dashboard: React.FC = () => {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [loading, setLoading] = useState(true);

  // States cho Tra cứu định mức
  const [searchName, setSearchName] = useState('');
  const [filterDept, setFilterDept] = useState('');

  // States cho Trạm Radar tìm giáo viên trống
  const [radarDay, setRadarDay] = useState<number>(2);
  const [radarSession, setRadarSession] = useState<'Sáng' | 'Chiều'>('Sáng');
  const [radarPeriod, setRadarPeriod] = useState<number>(1);

  const departments = [
    'Toán - Tin', 'KHTN và Công nghệ', 'Văn - GDCD', 
    'Ngoại ngữ', 'Sử - Địa', 'Nghệ thuật - Thể chất', 'Chung'
  ];

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [allSchedules, allTeachers] = await Promise.all([
          scheduleService.getAllSchedules(),
          teacherService.getAllTeachers()
        ]);
        setSchedules(allSchedules);
        setTeachers(allTeachers);
      } catch (error) {
        console.error("Error fetching dashboard data:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  // ===============================================================
  // 1. TÍNH TOÁN DỮ LIỆU NỀN
  // ===============================================================
  const baseStats = useMemo(() => {
    if (loading || schedules.length === 0) return null;

    const uniqueClasses = new Set(schedules.map(s => s.lop));
    const uniqueRooms = new Set(schedules.map(s => s.phong).filter(p => p && p !== 'null' && p !== 'undefined'));

    // Tính tải trọng cho từng giáo viên (Bao gồm cả người chưa có tiết = 0)
    const loadMap = new Map<string, number>();
    schedules.forEach(s => {
      loadMap.set(s.giao_vien, (loadMap.get(s.giao_vien) || 0) + 1);
    });

    const teacherLoads = teachers
      .filter(t => t.name !== 'nguyendongnam261189@gmail.com') // Bỏ qua tài khoản test
      .map(t => ({
        name: t.name,
        group: t.group || 'Chưa phân tổ',
        load: loadMap.get(t.name) || 0
      }));

    return {
      totalClasses: uniqueClasses.size,
      totalRooms: uniqueRooms.size,
      totalPeriods: schedules.length,
      teacherLoads
    };
  }, [loading, schedules, teachers]);

  // ===============================================================
  // 2. LOGIC TRẠM RADAR (Tìm GV Trống Tiết)
  // ===============================================================
  const freeTeachers = useMemo(() => {
    if (!baseStats) return [];

    // Lấy danh sách những người ĐANG DẠY ở thời điểm được chọn
    const busyTeacherNames = new Set(
      schedules
        .filter(s => s.thu === radarDay && s.buoi === radarSession && s.tiet === radarPeriod)
        .map(s => s.giao_vien)
    );

    // Lọc ra những người KHÔNG nằm trong danh sách bận
    return baseStats.teacherLoads
      .filter(t => !busyTeacherNames.has(t.name))
      // Sắp xếp ưu tiên: Người có tổng số tiết trong tuần ÍT NHẤT lên đầu
      .sort((a, b) => a.load - b.load);
      
  }, [schedules, baseStats, radarDay, radarSession, radarPeriod]);

  // ===============================================================
  // 3. LOGIC LỌC ĐỊNH MỨC THEO TỔ/TÊN
  // ===============================================================
  const filteredTeacherLoads = useMemo(() => {
    if (!baseStats) return [];
    
    return baseStats.teacherLoads
      .filter(t => {
        const matchName = t.name.toLowerCase().includes(searchName.toLowerCase());
        const matchDept = filterDept ? t.group === filterDept : true;
        return matchName && matchDept;
      })
      // Mặc định sắp xếp theo Tên (A-Z) để BGH dễ dò theo danh sách
      .sort((a, b) => {
        const nameA = a.name.split(' ').pop() || '';
        const nameB = b.name.split(' ').pop() || '';
        return nameA.localeCompare(nameB, 'vi');
      });
  }, [baseStats, searchName, filterDept]);


  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader2 className="h-8 w-8 text-indigo-600 animate-spin" />
      </div>
    );
  }

  if (!baseStats) {
    return (
      <div className="text-center py-12 text-gray-500 bg-gray-50 rounded-xl border border-dashed border-gray-300">
         Chưa có dữ liệu TKB để thống kê. Admin vui lòng tải dữ liệu lên.
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* HEADER */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 sticky top-0 z-10">
        <h2 className="text-2xl font-bold text-gray-800 flex items-center mb-1">
          <LayoutDashboard className="mr-2.5 text-indigo-600 h-7 w-7" /> Trạm Chỉ Huy & Thống Kê
        </h2>
        <p className="text-sm text-gray-500 mt-1">Hỗ trợ Ban Giám hiệu điều phối nhân sự dựa trên TKB thực tế.</p>
      </div>

      {/* KPI CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-xl shadow-sm border border-indigo-100 flex items-center space-x-4">
          <div className="bg-indigo-100 p-3 rounded-full text-indigo-600">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase">Tổng Giáo viên</p>
            <p className="text-2xl font-extrabold text-indigo-950">{teachers.length}</p>
          </div>
        </div>
        <div className="bg-white p-5 rounded-xl shadow-sm border border-sky-100 flex items-center space-x-4">
          <div className="bg-sky-100 p-3 rounded-full text-sky-600">
            <Presentation className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase">Tổng Lớp học</p>
            <p className="text-2xl font-extrabold text-sky-950">{baseStats.totalClasses}</p>
          </div>
        </div>
        <div className="bg-white p-5 rounded-xl shadow-sm border border-amber-100 flex items-center space-x-4">
          <div className="bg-amber-100 p-3 rounded-full text-amber-600">
            <BarChart3 className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase">Tổng Tiết / Tuần</p>
            <p className="text-2xl font-extrabold text-amber-950">{baseStats.totalPeriods}</p>
          </div>
        </div>
        <div className="bg-white p-5 rounded-xl shadow-sm border border-emerald-100 flex items-center space-x-4">
          <div className="bg-emerald-100 p-3 rounded-full text-emerald-600">
            <Building2 className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase">Số Phòng (TKB)</p>
            <p className="text-2xl font-extrabold text-emerald-950">{baseStats.totalRooms}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* ==========================================
            KHU VỰC 1: TRA CỨU TẢI GIẢNG DẠY CÁ NHÂN
            ========================================== */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 flex flex-col h-[600px]">
          <div className="flex items-center mb-5 border-b pb-3 border-gray-100">
            <Search className="w-5 h-5 mr-2 text-indigo-500"/>
            <h3 className="text-lg font-bold text-gray-900">Tra cứu Số tiết theo Cá nhân/Tổ</h3>
          </div>

          <div className="flex gap-3 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
              <input
                type="text"
                placeholder="Nhập tên GV..."
                className="pl-9 pr-3 py-2 w-full border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 text-sm"
                value={searchName}
                onChange={(e) => setSearchName(e.target.value)}
              />
            </div>
            <div className="relative w-48">
              <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
              <select
                className="pl-9 pr-8 py-2 w-full border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 text-sm appearance-none"
                value={filterDept}
                onChange={(e) => setFilterDept(e.target.value)}
              >
                <option value="">Toàn trường</option>
                {departments.map(dept => (
                  <option key={dept} value={dept}>{dept}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="bg-gray-50 px-4 py-2 rounded-t-lg border border-gray-200 flex text-xs font-bold text-gray-500 uppercase">
            <div className="w-8 text-center">STT</div>
            <div className="flex-1 px-2">Họ và Tên</div>
            <div className="w-32 hidden sm:block">Tổ CM</div>
            <div className="w-16 text-right">Số Tiết</div>
          </div>
          
          <div className="flex-1 overflow-y-auto border-x border-b border-gray-200 rounded-b-lg divide-y divide-gray-100">
            {filteredTeacherLoads.length > 0 ? (
              filteredTeacherLoads.map((t, index) => (
                <div key={t.name} className="flex items-center px-4 py-3 hover:bg-indigo-50/50 transition-colors">
                  <div className="w-8 text-center text-sm font-semibold text-gray-400">{index + 1}</div>
                  <div className="flex-1 px-2 font-bold text-indigo-900 text-sm">{t.name}</div>
                  <div className="w-32 hidden sm:block text-xs text-gray-500 truncate" title={t.group}>{t.group}</div>
                  <div className="w-16 text-right">
                    <span className={`inline-flex items-center justify-center px-2 py-1 rounded text-sm font-bold ${
                      t.load === 0 ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
                    }`}>
                      {t.load}
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <div className="p-8 text-center text-gray-500 text-sm">Không tìm thấy giáo viên nào khớp với bộ lọc.</div>
            )}
          </div>
        </div>

        {/* ==========================================
            KHU VỰC 2: RADAR TÌM GIÁO VIÊN TRỐNG TIẾT
            ========================================== */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-emerald-200 flex flex-col h-[600px] relative overflow-hidden">
          {/* Hiệu ứng trang trí Radar */}
          <div className="absolute top-0 right-0 -mt-10 -mr-10 text-emerald-50 opacity-50 pointer-events-none">
            <Radar className="w-48 h-48" />
          </div>

          <div className="flex items-center mb-5 border-b pb-3 border-emerald-100 relative z-10">
            <Radar className="w-5 h-5 mr-2 text-emerald-500"/>
            <h3 className="text-lg font-bold text-gray-900">Radar Tìm người Trống tiết</h3>
          </div>

          <p className="text-xs text-gray-500 mb-3 relative z-10">Chọn thời điểm để quét danh sách các GV đang không có giờ dạy. Kết quả được sắp xếp ưu tiên người có ít tiết nhất trong tuần.</p>

          <div className="grid grid-cols-3 gap-2 mb-4 relative z-10">
            <select
              className="px-3 py-2 border border-emerald-200 rounded-lg focus:ring-2 focus:ring-emerald-500 text-sm font-semibold text-emerald-900 bg-emerald-50"
              value={radarDay}
              onChange={(e) => setRadarDay(Number(e.target.value))}
            >
              {[2,3,4,5,6,7].map(d => <option key={d} value={d}>Thứ {d}</option>)}
            </select>
            
            <select
              className="px-3 py-2 border border-emerald-200 rounded-lg focus:ring-2 focus:ring-emerald-500 text-sm font-semibold text-emerald-900 bg-emerald-50"
              value={radarSession}
              onChange={(e) => setRadarSession(e.target.value as 'Sáng' | 'Chiều')}
            >
              <option value="Sáng">Buổi Sáng</option>
              <option value="Chiều">Buổi Chiều</option>
            </select>

            <select
              className="px-3 py-2 border border-emerald-200 rounded-lg focus:ring-2 focus:ring-emerald-500 text-sm font-semibold text-emerald-900 bg-emerald-50"
              value={radarPeriod}
              onChange={(e) => setRadarPeriod(Number(e.target.value))}
            >
              {[1,2,3,4,5].map(p => <option key={p} value={p}>Tiết {p}</option>)}
            </select>
          </div>

          <div className="bg-emerald-600 px-4 py-2 rounded-t-lg flex text-xs font-bold text-white uppercase shadow-sm relative z-10">
            <div className="flex-1">Giáo viên Khả dụng ({freeTeachers.length})</div>
            <div className="w-24 text-right" title="Tổng số tiết GV này phải dạy trong tuần">Tổng tiết/Tuần</div>
          </div>
          
          <div className="flex-1 overflow-y-auto border-x border-b border-emerald-200 rounded-b-lg divide-y divide-emerald-50 bg-white relative z-10">
            {freeTeachers.length > 0 ? (
              freeTeachers.map((t) => (
                <div key={t.name} className="flex items-center justify-between px-4 py-3 hover:bg-emerald-50 transition-colors group">
                  <div>
                    <div className="font-bold text-gray-800 text-sm group-hover:text-emerald-700">{t.name}</div>
                    <div className="text-xs text-gray-500">{t.group}</div>
                  </div>
                  <div className="flex items-center text-emerald-700 font-bold bg-emerald-100 px-2.5 py-1 rounded-md text-sm">
                    <Clock className="w-3.5 h-3.5 mr-1.5 opacity-70" />
                    {t.load}
                  </div>
                </div>
              ))
            ) : (
              <div className="p-8 text-center text-emerald-600 font-medium text-sm">Tất cả giáo viên đều đang có giờ dạy ở tiết này!</div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
};

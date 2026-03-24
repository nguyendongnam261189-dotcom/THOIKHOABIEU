import React, { useState, useEffect, useMemo } from 'react';
import { Schedule, Teacher } from '../types';
import { scheduleService } from '../services/scheduleService';
import { teacherService } from '../services/teacherService';
import { LayoutDashboard, Users, Presentation, Building2, BarChart3, Loader2, Search, Filter, Radar, Clock, AlertCircle, Layers } from 'lucide-react';

// 🔥 TIẾP NHẬN PROPS ROLE VÀ DEPARTMENT ĐỂ PHÂN QUYỀN
export const Dashboard: React.FC<{ role?: 'admin' | 'manager' | 'teacher' | 'ttcm' | null, department?: string | null }> = ({ role, department }) => {
  const [allSchedules, setAllSchedules] = useState<Schedule[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [loading, setLoading] = useState(true);

  // States cho Tra cứu định mức
  const [searchName, setSearchName] = useState('');
  const [filterDept, setFilterDept] = useState('');

  // 🔥 STATES CHO ĐA PHIÊN BẢN
  const [versions, setVersions] = useState<string[]>([]);
  const [selectedVersion, setSelectedVersion] = useState<string>('');

  // States cho Trạm Radar tìm giáo viên trống
  const [radarDay, setRadarDay] = useState<number>(new Date().getDay() + 1 > 7 ? 2 : new Date().getDay() + 1);
  const [radarSession, setRadarSession] = useState<'Sáng' | 'Chiều'>('Sáng');
  const [radarPeriod, setRadarPeriod] = useState<number>(1);
  const [radarDept, setRadarDept] = useState<string>(''); 

  // Kiểm tra TTCM mồ côi
  const isOrphanTTCM = role === 'ttcm' && (!department || department === 'undefined' || String(department) === 'null');

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [schedulesData, allTeachers] = await Promise.all([
          scheduleService.getAllSchedules(),
          teacherService.getAllTeachers()
        ]);

        setAllSchedules(schedulesData);

        // 🔥 TRÍCH XUẤT DANH SÁCH PHIÊN BẢN
        const uniqueVersions = Array.from(new Set(schedulesData.map(s => s.versionName || 'Mặc định'))).sort().reverse();
        setVersions(uniqueVersions);
        if (uniqueVersions.length > 0 && !selectedVersion) {
          setSelectedVersion(uniqueVersions[0]);
        }

        // PHÂN QUYỀN GIÁO VIÊN
        let allowedTeachers = allTeachers;
        if (role === 'ttcm' && !isOrphanTTCM) {
          allowedTeachers = allTeachers.filter(t => t.group === department);
        }
        setTeachers(allowedTeachers);

      } catch (error) {
        console.error("Error fetching dashboard data:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [role, department, isOrphanTTCM]);

  // 🔥 LỌC LỊCH DẠY THEO PHIÊN BẢN VÀ QUYỀN HẠN
  const schedules = useMemo(() => {
    let filtered = allSchedules.filter(s => (s.versionName || 'Mặc định') === selectedVersion);
    
    if (role === 'ttcm' && !isOrphanTTCM) {
      const allowedNames = new Set(teachers.map(t => t.name));
      filtered = filtered.filter(s => allowedNames.has(s.giao_vien));
    }
    return filtered;
  }, [allSchedules, selectedVersion, role, department, teachers, isOrphanTTCM]);

  // Tự động tạo danh sách tổ từ dữ liệu thực tế
  const dynamicDepartments = useMemo(() => {
    return Array.from(new Set(teachers.map(t => t.group))).filter(Boolean).sort();
  }, [teachers]);

  const baseStats = useMemo(() => {
    if (loading || (role === 'ttcm' && teachers.length === 0)) return null;

    const uniqueClasses = new Set(schedules.map(s => s.lop));
    const uniqueRooms = new Set(schedules.map(s => s.phong).filter(p => p && p !== 'null' && p !== 'undefined' && p !== ''));

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
      totalRooms: uniqueRooms.size,
      totalPeriods: schedules.length,
      teacherLoads
    };
  }, [loading, schedules, teachers, role]);

  const freeTeachers = useMemo(() => {
    if (!baseStats) return [];
    
    const busyTeacherNames = new Set(
      schedules
        .filter(s => s.thu === radarDay && s.buoi === radarSession && s.tiet === radarPeriod)
        .map(s => s.giao_vien)
    );

    return baseStats.teacherLoads
      .filter(t => !busyTeacherNames.has(t.name))
      .filter(t => radarDept ? t.group === radarDept : true)
      .sort((a, b) => a.load - b.load);
  }, [schedules, baseStats, radarDay, radarSession, radarPeriod, radarDept]);

  const filteredTeacherLoads = useMemo(() => {
    if (!baseStats) return [];
    return baseStats.teacherLoads
      .filter(t => {
        const matchName = t.name.toLowerCase().includes(searchName.toLowerCase());
        const matchDept = filterDept ? t.group === filterDept : true;
        return matchName && matchDept;
      })
      .sort((a, b) => {
        const nameA = a.name.split(' ').pop() || '';
        const nameB = b.name.split(' ').pop() || '';
        return nameA.localeCompare(nameB, 'vi');
      });
  }, [baseStats, searchName, filterDept]);

  if (loading) return <div className="flex justify-center items-center h-64"><Loader2 className="h-8 w-8 text-indigo-600 animate-spin" /></div>;

  if (isOrphanTTCM) {
    return (
      <div className="flex flex-col items-center justify-center py-16 bg-yellow-50 rounded-xl border border-dashed border-yellow-300">
         <AlertCircle className="w-16 h-16 text-yellow-500 mb-4" />
         <h3 className="text-xl font-bold text-yellow-800 mb-2">Chưa phân công Tổ chuyên môn</h3>
         <p className="text-yellow-700 text-center max-w-md">Vui lòng báo Admin cập nhật thông tin Tổ chuyên môn cho tài khoản của bạn để xem thống kê.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 sticky top-0 z-10">
        <div className="flex flex-col lg:flex-row justify-between lg:items-center gap-4">
          <div>
            <h2 className="text-2xl font-bold text-gray-800 flex items-center mb-1">
              <LayoutDashboard className="mr-2.5 text-indigo-600 h-7 w-7" /> 
              {role === 'ttcm' ? `Thống kê Tổ: ${department}` : 'Trạm Chỉ Huy & Thống Kê'}
            </h2>
            <p className="text-sm text-gray-500 mt-1">Hỗ trợ {role === 'ttcm' ? 'quản lý định mức tổ' : 'điều phối nhân sự'} dựa trên TKB thực tế.</p>
          </div>

          {/* 🔥 BỘ CHỌN PHIÊN BẢN TKB CHO DASHBOARD */}
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

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
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
          <div><p className="text-xs font-medium text-gray-500 uppercase">Tiết / Tuần</p><p className="text-2xl font-extrabold text-amber-950">{baseStats?.totalPeriods || 0}</p></div>
        </div>
        <div className="bg-white p-5 rounded-xl shadow-sm border border-emerald-100 flex items-center space-x-4">
          <div className="bg-emerald-100 p-3 rounded-full text-emerald-600"><Building2 className="w-6 h-6" /></div>
          <div><p className="text-xs font-medium text-gray-500 uppercase">Số Phòng</p><p className="text-2xl font-extrabold text-emerald-950">{baseStats?.totalRooms || 0}</p></div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 flex flex-col h-[600px]">
          <div className="flex items-center mb-5 border-b pb-3 border-gray-100">
            <Search className="w-5 h-5 mr-2 text-indigo-500"/><h3 className="text-lg font-bold text-gray-900">Tra cứu Định mức tiết dạy</h3>
          </div>
          <div className="flex gap-3 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
              <input type="text" placeholder="Tìm tên GV..." className="pl-9 pr-3 py-2 w-full border border-gray-300 rounded-lg text-sm" value={searchName} onChange={(e) => setSearchName(e.target.value)} />
            </div>
            {(role === 'admin' || role === 'manager') && (
              <select className="px-3 py-2 border border-gray-300 rounded-lg text-sm w-40" value={filterDept} onChange={(e) => setFilterDept(e.target.value)}>
                <option value="">Toàn trường</option>
                {dynamicDepartments.map(dept => <option key={dept} value={dept}>{dept}</option>)}
              </select>
            )}
          </div>
          <div className="bg-gray-50 px-4 py-2 rounded-t-lg border border-gray-200 flex text-xs font-bold text-gray-500 uppercase">
            <div className="w-8 text-center">STT</div><div className="flex-1 px-2">Họ tên</div><div className="w-16 text-right">Số tiết</div>
          </div>
          <div className="flex-1 overflow-y-auto border-x border-b border-gray-200 rounded-b-lg divide-y divide-gray-100">
            {filteredTeacherLoads.length > 0 ? filteredTeacherLoads.map((t, index) => (
              <div key={t.name} className="flex items-center px-4 py-3 hover:bg-indigo-50/50">
                <div className="w-8 text-center text-sm text-gray-400">{index + 1}</div>
                <div className="flex-1 px-2 font-bold text-indigo-900 text-sm">{t.name} <span className="block text-[10px] font-normal text-gray-500">{t.group}</span></div>
                <div className="w-16 text-right"><span className={`px-2 py-1 rounded text-sm font-bold ${t.load === 0 ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>{t.load}</span></div>
              </div>
            )) : (
              <div className="text-center py-8 text-gray-500 italic text-sm">Không tìm thấy dữ liệu.</div>
            )}
          </div>
        </div>

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
            {(role === 'admin' || role === 'manager') && (
              <select className="px-2 py-2 border border-emerald-200 rounded-lg text-xs font-bold text-emerald-900 bg-emerald-50" value={radarDept} onChange={(e) => setRadarDept(e.target.value)}>
                <option value="">Tất cả tổ</option>
                {dynamicDepartments.map(dept => <option key={dept} value={dept}>{dept}</option>)}
              </select>
            )}
          </div>
          <div className="bg-emerald-600 px-4 py-2 rounded-t-lg flex text-xs font-bold text-white uppercase"><div className="flex-1">GV Khả dụng ({freeTeachers.length})</div><div className="w-16 text-right">Tổng tiết</div></div>
          <div className="flex-1 overflow-y-auto border-x border-b border-emerald-200 rounded-b-lg divide-y divide-emerald-50">
            {freeTeachers.length > 0 ? freeTeachers.map((t) => (
              <div key={t.name} className="flex items-center justify-between px-4 py-3 hover:bg-emerald-50">
                <div><div className="font-bold text-gray-800 text-sm">{t.name}</div><div className="text-[10px] text-gray-500">{t.group}</div></div>
                <div className="flex items-center text-emerald-700 font-bold bg-emerald-100 px-2 py-1 rounded text-sm"><Clock className="w-3 h-3 mr-1" />{t.load}</div>
              </div>
            )) : (
              <div className="text-center py-8 text-emerald-600 italic text-sm">Tất cả giáo viên đều bận tiết này.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

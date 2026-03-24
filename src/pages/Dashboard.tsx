import React, { useState, useEffect, useMemo } from 'react';
import { Schedule, Teacher } from '../types';
import { scheduleService } from '../services/scheduleService';
import { teacherService } from '../services/teacherService';
import { LayoutDashboard, Users, BookOpen, Presentation, Building2, BarChart3, Loader2 } from 'lucide-react';

export const Dashboard: React.FC = () => {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        // Tải dữ liệu thật từ Firebase
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
  // 🔥 PHÉP THUẬT TÍNH TOÁN LOGIC (THỐNG KÊ REAL-TIME)
  // ===============================================================
  
  const stats = useMemo(() => {
    if (loading || schedules.length === 0) return null;

    // 1. Đếm số lớp học (unique 'lop' từ TKB)
    const uniqueClasses = new Set(schedules.map(s => s.lop));
    
    // 2. Đếm số phòng học (unique 'phong' từ TKB)
    const uniqueRooms = new Set(schedules.map(s => s.phong).filter(p => p && p !== 'null' && p !== 'undefined'));

    // 3. Tính tổng số tiết dạy toàn trường trong tuần
    const totalPeriods = schedules.length;

    // 4. Tính toán tải dạy (Teaching Load) của từng Giáo viên
    // Kết quả mong muốn: Map<Tên_GV, Tổng_số_tiết>
    const teacherLoadMap = new Map<string, number>();
    schedules.forEach(s => {
      const currentLoad = teacherLoadMap.get(s.giao_vien) || 0;
      teacherLoadMap.set(s.giao_vien, currentLoad + 1);
    });

    // Chuyển Map thành mảng để sắp xếp, bỏ qua sếp tổng test
    const sortedTeacherLoad = Array.from(teacherLoadMap.entries())
      .map(([name, load]) => ({ name, load }))
      .filter(item => item.name !== 'nguyendongnam261189@gmail.com')
      .sort((a, b) => b.load - a.load); // Sắp xếp giảm dần

    // Lấy tiết dạy cao nhất để làm mốc tính % cho progress bar
    const maxLoad = sortedTeacherLoad.length > 0 ? sortedTeacherLoad[0].load : 1;

    // 5. Thống kê số tiết theo Môn học
    const subjectStatsMap = new Map<string, number>();
    schedules.forEach(s => {
      const currentCount = subjectStatsMap.get(s.mon) || 0;
      subjectStatsMap.set(s.mon, currentCount + 1);
    });

    const sortedSubjectStats = Array.from(subjectStatsMap.entries())
      .map(([subject, count]) => ({ subject, count }))
      .sort((a, b) => b.count - a.count); // Sắp xếp môn nhiều tiết lên đầu

    return {
      totalTeachers: teachers.length,
      totalClasses: uniqueClasses.size,
      totalRooms: uniqueRooms.size,
      totalPeriods,
      teacherLoad: sortedTeacherLoad,
      maxLoad,
      subjectStats: sortedSubjectStats
    };
  }, [loading, schedules, teachers]);

  // ===============================================================
  // GIAO DIỆN HIỂN THỊ
  // ===============================================================

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader2 className="h-8 w-8 text-indigo-600 animate-spin" />
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="text-center py-12 text-gray-500 bg-gray-50 rounded-xl border border-dashed border-gray-300">
         Chưa có dữ liệu TKB để thống kê. Admin vui lòng tải dữ liệu lên.
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* 1. Header & Title */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 sticky top-0 z-10">
        <h2 className="text-2xl font-bold text-gray-800 flex items-center mb-1">
          <LayoutDashboard className="mr-2.5 text-indigo-600 h-7 w-7" /> Bảng điều khiển Thống kê
        </h2>
        <p className="text-sm text-gray-500 mt-1">Dữ liệu phân tích dựa trên TKB đang áp dụng.</p>
      </div>

      {/* 2. KHU VỰC KPI CARDS (THẺ THỐNG KÊ NHANH) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Thẻ Giáo viên */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-indigo-100 flex items-center space-x-4 transition-transform hover:scale-105 active:scale-95 cursor-default">
          <div className="bg-indigo-100 p-4 rounded-full text-indigo-600">
            <Users className="w-8 h-8" />
          </div>
          <div>
            <p className="text-sm font-medium text-gray-500 uppercase">Giáo viên</p>
            <p className="text-3xl font-extrabold text-indigo-950">{stats.totalTeachers}</p>
          </div>
        </div>

        {/* Thẻ Lớp học */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-sky-100 flex items-center space-x-4 transition-transform hover:scale-105 active:scale-95 cursor-default">
          <div className="bg-sky-100 p-4 rounded-full text-sky-600">
            <Presentation className="w-8 h-8" />
          </div>
          <div>
            <p className="text-sm font-medium text-gray-500 uppercase">Lớp học</p>
            <p className="text-3xl font-extrabold text-sky-950">{stats.totalClasses}</p>
          </div>
        </div>

        {/* Thẻ Tổng tiết dạy */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-amber-100 flex items-center space-x-4 transition-transform hover:scale-105 active:scale-95 cursor-default">
          <div className="bg-amber-100 p-4 rounded-full text-amber-600">
            <BarChart3 className="w-8 h-8" />
          </div>
          <div>
            <p className="text-sm font-medium text-gray-500 uppercase">Tổng tiết / Tuần</p>
            <p className="text-3xl font-extrabold text-amber-950">{stats.totalPeriods}</p>
          </div>
        </div>

        {/* Thẻ Phòng học */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-emerald-100 flex items-center space-x-4 transition-transform hover:scale-105 active:scale-95 cursor-default">
          <div className="bg-emerald-100 p-4 rounded-full text-emerald-600">
            <Building2 className="w-8 h-8" />
          </div>
          <div>
            <p className="text-sm font-medium text-gray-500 uppercase">Phòng học (TKB)</p>
            <p className="text-3xl font-extrabold text-emerald-950">{stats.totalRooms}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* 3. KHU VỰC BIỂU ĐỒ TẢI DẠY (TEACHING LOAD) - DÙNG Tailwind DRAWING */}
        <div className="lg:col-span-2 bg-white p-6 rounded-xl shadow-sm border border-gray-200">
          <div className="flex justify-between items-center mb-5 border-b pb-3 border-gray-100">
            <h3 className="text-lg font-bold text-gray-900 flex items-center">
                <Users className="w-5 h-5 mr-2 text-indigo-500"/>
                Tải giảng dạy Giáo viên (Số tiết / Tuần)
            </h3>
            <span className="bg-indigo-50 text-indigo-700 text-xs font-bold px-2.5 py-1 rounded-full border border-indigo-200">
              Top 20 GV dạy nhiều nhất
            </span>
          </div>

          <div className="space-y-5 max-h-[500px] overflow-y-auto pr-2 hide-scrollbar">
            {stats.teacherLoad.slice(0, 20).map((item, index) => {
              // Tính % độ dài thanh progress dựa trên người dạy nhiều nhất
              const percentage = Math.round((item.load / stats.maxLoad) * 100);
              
              return (
                <div key={item.name} className="flex items-center gap-3 group">
                  <span className="font-bold text-gray-400 w-6 text-center text-sm">{index + 1}</span>
                  <div className="w-40 truncate" title={item.name}>
                    <p className="text-sm font-semibold text-gray-800 group-hover:text-indigo-700">{item.name}</p>
                  </div>
                  <div className="flex-1 bg-gray-100 rounded-full h-4 relative overflow-hidden shadow-inner border border-gray-200">
                    {/* Vẽ thanh Progress bằng CSS */}
                    <div 
                      className="absolute left-0 top-0 h-full bg-indigo-500 rounded-full transition-all duration-1000 group-hover:bg-indigo-600"
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                  <div className="w-16 text-right">
                    <span className="font-bold text-base text-gray-900">{item.load}</span>
                    <span className="text-xs text-gray-500 ml-1">tiết</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 4. KHU VỰC THỐNG KÊ MÔN HỌC */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
           <div className="flex justify-between items-center mb-5 border-b pb-3 border-gray-100">
            <h3 className="text-lg font-bold text-gray-900 flex items-center">
                <BookOpen className="w-5 h-5 mr-2 text-sky-500"/>
                Phân bổ Tiết dạy theo Môn
            </h3>
          </div>
          
          <div className="space-y-4 max-h-[500px] overflow-y-auto hide-scrollbar">
            {stats.subjectStats.map((item) => (
              <div key={item.subject} className="flex justify-between items-center bg-gray-50 p-3 rounded-lg border border-gray-100 hover:bg-sky-50/50 hover:border-sky-100 transition-colors">
                <span className="font-semibold text-sm text-gray-800">{item.subject}</span>
                <span className="bg-sky-100 text-sky-800 text-sm font-bold px-3 py-1 rounded-full">
                  {item.count} tiết
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

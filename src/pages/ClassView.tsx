import React, { useState, useEffect } from 'react';
import { Schedule } from '../types';
import { scheduleService } from '../services/scheduleService';
import { Search, Calendar } from 'lucide-react';

export const ClassView: React.FC = () => {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [classes, setClasses] = useState<string[]>([]);
  const [searchClass, setSearchClass] = useState('');
  const [selectedClass, setSelectedClass] = useState<string | null>(null);
  const [filterSession, setFilterSession] = useState('');

  useEffect(() => {
    const fetchData = async () => {
      const allSchedules = await scheduleService.getAllSchedules();
      setSchedules(allSchedules);
      
      const classSet = new Set<string>();
      allSchedules.forEach(s => {
        if (s.lop) {
          s.lop.split(', ').forEach(c => classSet.add(c.trim()));
        }
      });
      const uniqueClasses = Array.from(classSet).filter(Boolean).sort();
      setClasses(uniqueClasses);
    };
    fetchData();
  }, []);

  const filteredClasses = classes.filter(c => 
    c.toLowerCase().includes(searchClass.toLowerCase())
  );

  const getScheduleForClass = (className: string) => {
    return schedules.filter(s => s.lop.split(', ').map(c => c.trim()).includes(className) && (filterSession ? s.buoi === filterSession : true));
  };

  const renderScheduleGrid = (classSchedules: Schedule[]) => {
    const days = [2, 3, 4, 5, 6, 7];
    let periods = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

    // Lọc số dòng hiển thị dựa trên tuỳ chọn Sáng/Chiều
    if (filterSession === 'Sáng') {
      periods = [1, 2, 3, 4, 5];
    } else if (filterSession === 'Chiều') {
      periods = [6, 7, 8, 9, 10];
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
            {periods.map(period => (
              <tr key={period} className={period === 5 && filterSession === '' ? 'border-b-4 border-gray-300' : ''}>
                <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900 border-r bg-gray-50">
                  Tiết {period} {period <= 5 ? '(Sáng)' : '(Chiều)'}
                </td>
                {days.map(day => {
                  const session = period <= 5 ? 'Sáng' : 'Chiều';
                  const adjustedPeriod = period <= 5 ? period : period - 5;
                  const slot = classSchedules.find(s => s.thu === day && s.tiet === adjustedPeriod && s.buoi === session);
                  
                  return (
                    <td key={`${day}-${period}`} className={`px-4 py-3 whitespace-nowrap text-sm text-center border-r ${slot ? 'bg-emerald-50' : 'bg-gray-100/50'}`}>
                      {slot ? (
                        <div className="flex flex-col items-center">
                          <span className="font-bold text-emerald-700">{slot.mon}</span>
                          <span className="text-xs text-gray-600">{slot.giao_vien}</span>
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
          <Calendar className="mr-2 text-emerald-600" /> Tra cứu TKB theo Lớp
        </h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5" />
            <input
              type="text"
              placeholder="Tìm tên lớp..."
              className="pl-10 pr-4 py-2 w-full border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
              value={searchClass}
              onChange={(e) => setSearchClass(e.target.value)}
            />
          </div>

          <select
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500"
            value={filterSession}
            onChange={(e) => setFilterSession(e.target.value)}
          >
            <option value="">Cả ngày</option>
            <option value="Sáng">Sáng</option>
            <option value="Chiều">Chiều</option>
          </select>
        </div>

        {/* Class Selection List */}
        {!selectedClass && (
          <div className="grid grid-cols-3 md:grid-cols-6 lg:grid-cols-8 gap-3">
            {filteredClasses.map(className => (
              <button
                key={className}
                onClick={() => setSelectedClass(className)}
                className="p-3 text-sm font-semibold text-gray-800 border border-gray-200 rounded-lg hover:bg-emerald-50 hover:border-emerald-300 transition-colors text-center"
              >
                {className}
              </button>
            ))}
          </div>
        )}

        {/* Selected Class Schedule */}
        {selectedClass && (
          <div>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold text-emerald-700">TKB Lớp: {selectedClass}</h3>
              <button 
                onClick={() => setSelectedClass(null)}
                className="text-sm text-gray-600 hover:text-emerald-600 underline"
              >
                ← Chọn lớp khác
              </button>
            </div>
            {renderScheduleGrid(getScheduleForClass(selectedClass))}
          </div>
        )}
      </div>
    </div>
  );
};

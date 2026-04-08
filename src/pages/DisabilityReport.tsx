import React, { useState } from 'react';
import { FileSpreadsheet, Settings, Users, Plus, Trash2, Download, Calendar, PenTool } from 'lucide-react';

interface DisabledStudent {
  id: string;
  className: string;
  studentName: string;
}

export const DisabilityReport: React.FC = () => {
  // 1. STATE: CẤU HÌNH TIÊU ĐỀ & THỜI GIAN (Linh hoạt cho mọi năm)
  const [config, setConfig] = useState({
    semester: 'II',
    schoolYear: '2025-2026',
    startMonth: 1,
    endMonth: 5,
    exportDate: 'tháng 5 năm 2026',
    principal: 'Bùi Duy Quốc',
    vicePrincipal: 'Nguyễn Văn Tuấn',
    deptHead: ''
  });

  // 2. STATE: QUẢN LÝ DANH SÁCH HỌC SINH
  const [students, setStudents] = useState<DisabledStudent[]>([]);
  const [newClass, setNewClass] = useState('');
  const [newName, setNewName] = useState('');

  // Hàm thêm học sinh
  const handleAddStudent = () => {
    if (!newClass.trim() || !newName.trim()) {
      alert("Vui lòng nhập đủ Tên lớp và Họ tên học sinh!");
      return;
    }
    const newStudent: DisabledStudent = {
      id: Date.now().toString(),
      className: newClass.trim(),
      studentName: newName.trim()
    };
    setStudents([...students, newStudent]);
    setNewClass('');
    setNewName('');
  };

  // Hàm xóa học sinh
  const handleRemoveStudent = (id: string) => {
    setStudents(students.filter(s => s.id !== id));
  };

  // Hàm xử lý xuất Excel (Tạm thời để trống chờ Thầy cung cấp code cũ)
  const handleExportExcel = () => {
    if (students.length === 0) {
      alert("Vui lòng thêm ít nhất 1 học sinh khuyết tật trước khi xuất file!");
      return;
    }
    alert(`Đang chuẩn bị xuất Excel cho Học kỳ ${config.semester}, từ tháng ${config.startMonth} đến tháng ${config.endMonth}...`);
    // Logic xuất Excel sẽ được cắm vào đây
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* HEADER */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-emerald-200">
        <h2 className="text-2xl font-bold text-gray-800 flex items-center mb-1">
          <FileSpreadsheet className="mr-2.5 text-emerald-600 h-7 w-7" /> 
          Báo cáo Kê khai Giờ dạy Khuyết tật (Mẫu 1)
        </h2>
        <p className="text-sm text-gray-500 mt-1">Cấu hình linh hoạt các thông số và xuất bảng kê khai tính phụ cấp theo chuẩn quy định.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* CỘT TRÁI: CẤU HÌNH THÔNG SỐ EXCEL */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-200">
            <div className="flex items-center mb-4 border-b pb-2 border-gray-100">
              <Calendar className="w-5 h-5 mr-2 text-indigo-500" />
              <h3 className="font-bold text-gray-800">Thời gian áp dụng</h3>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">Học kỳ</label>
                <select 
                  className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                  value={config.semester}
                  onChange={e => setConfig({...config, semester: e.target.value})}
                >
                  <option value="I">Học kỳ I</option>
                  <option value="II">Học kỳ II</option>
                  <option value="Hè">Dạy Hè</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">Năm học</label>
                <input type="text" className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-indigo-500 outline-none text-sm" value={config.schoolYear} onChange={e => setConfig({...config, schoolYear: e.target.value})} placeholder="VD: 2025-2026"/>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1">Từ tháng</label>
                  <input type="number" className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-indigo-500 outline-none text-sm" value={config.startMonth} onChange={e => setConfig({...config, startMonth: Number(e.target.value)})}/>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1">Đến tháng</label>
                  <input type="number" className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-indigo-500 outline-none text-sm" value={config.endMonth} onChange={e => setConfig({...config, endMonth: Number(e.target.value)})}/>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-200">
            <div className="flex items-center mb-4 border-b pb-2 border-gray-100">
              <PenTool className="w-5 h-5 mr-2 text-indigo-500" />
              <h3 className="font-bold text-gray-800">Thông tin Chữ ký</h3>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">Hiệu trưởng</label>
                <input type="text" className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-indigo-500 outline-none text-sm" value={config.principal} onChange={e => setConfig({...config, principal: e.target.value})}/>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">Phó Hiệu trưởng</label>
                <input type="text" className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-indigo-500 outline-none text-sm" value={config.vicePrincipal} onChange={e => setConfig({...config, vicePrincipal: e.target.value})}/>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">Tổ trưởng CM (Nếu có)</label>
                <input type="text" className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-indigo-500 outline-none text-sm" value={config.deptHead} onChange={e => setConfig({...config, deptHead: e.target.value})} placeholder="Để trống nếu để GV tự ký"/>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">Ngày tháng góc ký</label>
                <input type="text" className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-indigo-500 outline-none text-sm" value={config.exportDate} onChange={e => setConfig({...config, exportDate: e.target.value})} placeholder="VD: tháng 5 năm 2026"/>
              </div>
            </div>
          </div>
        </div>

        {/* CỘT PHẢI: QUẢN LÝ DANH SÁCH & XUẤT FILE */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
            <div className="flex items-center mb-5 border-b pb-3 border-gray-100">
              <Users className="w-5 h-5 mr-2 text-indigo-600" />
              <h3 className="font-bold text-gray-800 text-lg">Danh sách Lớp có học sinh khuyết tật</h3>
            </div>

            {/* Form thêm nhanh */}
            <div className="flex gap-2 mb-6 bg-gray-50 p-3 rounded-lg border border-gray-100">
              <input 
                type="text" 
                placeholder="Tên lớp (VD: 6/1)" 
                className="w-1/3 p-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                value={newClass}
                onChange={e => setNewClass(e.target.value)}
              />
              <input 
                type="text" 
                placeholder="Họ và tên học sinh khuyết tật..." 
                className="flex-1 p-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                value={newName}
                onChange={e => setNewName(e.target.value)}
              />
              <button 
                onClick={handleAddStudent}
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-lg flex items-center text-sm font-bold transition-colors"
              >
                <Plus className="w-4 h-4 mr-1" /> Thêm
              </button>
            </div>

            {/* Bảng danh sách */}
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <table className="w-full text-left">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="p-3 text-sm font-bold text-gray-600 w-16 text-center">STT</th>
                    <th className="p-3 text-sm font-bold text-gray-600 w-24 text-center">LỚP</th>
                    <th className="p-3 text-sm font-bold text-gray-600">HỌ VÀ TÊN HỌC SINH</th>
                    <th className="p-3 text-sm font-bold text-gray-600 w-20 text-center">XÓA</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {students.map((student, idx) => (
                    <tr key={student.id} className="hover:bg-gray-50/50">
                      <td className="p-3 text-center text-gray-500 font-medium">{idx + 1}</td>
                      <td className="p-3 text-center font-bold text-indigo-600">{student.className}</td>
                      <td className="p-3 font-bold text-gray-800">{student.studentName}</td>
                      <td className="p-3 text-center">
                        <button 
                          onClick={() => handleRemoveStudent(student.id)}
                          className="text-gray-400 hover:text-red-500 p-1.5 rounded-md hover:bg-red-50 transition-colors"
                          title="Xóa học sinh này"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {students.length === 0 && (
                    <tr>
                      <td colSpan={4} className="p-8 text-center text-gray-500 italic">
                        Chưa có học sinh nào được thêm vào danh sách.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            
            {/* Vùng Xuất File */}
            <div className="mt-6 pt-5 border-t border-gray-100 flex items-center justify-between">
              <div className="text-sm text-gray-500">
                Tổng cộng: <strong className="text-indigo-600">{students.length}</strong> học sinh
              </div>
              <button 
                onClick={handleExportExcel}
                disabled={students.length === 0}
                className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white px-6 py-3 rounded-lg flex items-center text-base font-bold transition-colors shadow-sm"
              >
                <Download className="w-5 h-5 mr-2" />
                Xuất Báo Cáo Excel (Mẫu 1)
              </button>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
};

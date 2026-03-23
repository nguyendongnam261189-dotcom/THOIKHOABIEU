import React, { useState } from 'react';
import { parseExcelFile } from '../services/excelParser';
import { scheduleService } from '../services/scheduleService';
import { teacherService } from '../services/teacherService';
import { Upload, FileSpreadsheet, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';

export const AdminDashboard: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error' | 'info', message: string } | null>(null);
  const [stats, setStats] = useState<{ schedules: number, teachers: number } | null>(null);
  const [combinedClasses, setCombinedClasses] = useState<any[]>([]);

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setStatus(null);
    }
  };

  const processUpload = async (schedules: any[], teachers: any[]) => {
    setStats({ schedules: schedules.length, teachers: teachers.length });
    setStatus({ type: 'info', message: `Đã đọc ${schedules.length} tiết dạy và ${teachers.length} giáo viên. Đang lưu vào cơ sở dữ liệu...` });

    try {
      await teacherService.saveTeachers(teachers);
      await scheduleService.saveSchedules(schedules);
      setStatus({ type: 'success', message: 'Cập nhật thời khóa biểu thành công!' });
    } catch (error: any) {
      setStatus({ type: 'error', message: `Lỗi khi lưu: ${error.message}` });
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = async () => {
    if (!file) return;

    setLoading(true);
    setStatus({ type: 'info', message: 'Đang đọc file Excel...' });

    try {
      const { schedules, teachers } = await parseExcelFile(file);
      const combined = schedules.filter(s => s.lop.includes(','));
      setCombinedClasses(combined);
      await processUpload(schedules, teachers);
    } catch (error: any) {
      console.error(error);
      setStatus({ type: 'error', message: `Lỗi: ${error.message || 'Không thể đọc file Excel. Vui lòng kiểm tra định dạng.'}` });
      setLoading(false);
    }
  };

  const handleDeleteAll = async () => {
    setLoading(true);
    try {
      await scheduleService.deleteAllSchedules();
      setStatus({ type: 'success', message: 'Đã xóa toàn bộ dữ liệu TKB.' });
      setStats(null);
      setShowDeleteConfirm(false);
    } catch (error: any) {
      setStatus({ type: 'error', message: `Lỗi khi xóa: ${error.message}` });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="bg-white p-8 rounded-xl shadow-sm border border-gray-200">
        <h2 className="text-2xl font-bold text-gray-800 mb-6 flex items-center">
          <Upload className="mr-2 text-indigo-600" /> Quản lý Dữ liệu Thời khóa biểu
        </h2>

        <div className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center hover:bg-gray-50 transition-colors">
          <FileSpreadsheet className="mx-auto h-12 w-12 text-gray-400 mb-4" />
          <p className="text-sm text-gray-600 mb-4">
            Hỗ trợ file .xlsx, .xls. File cần có các cột: Thứ, Tiết, Lớp, Môn, Giáo viên, Phòng, Buổi.
          </p>
          
          <input
            type="file"
            accept=".xlsx, .xls"
            onChange={handleFileChange}
            className="hidden"
            id="file-upload"
          />
          <label
            htmlFor="file-upload"
            className="cursor-pointer inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
          >
            Chọn file Excel
          </label>
          
          {file && (
            <p className="mt-4 text-sm font-medium text-indigo-600">
              Đã chọn: {file.name}
            </p>
          )}
        </div>

        <div className="mt-6 flex justify-between items-center">
          <button
            onClick={handleUpload}
            disabled={!file || loading}
            className={`inline-flex items-center px-6 py-3 border border-transparent text-base font-medium rounded-md shadow-sm text-white ${
              !file || loading ? 'bg-indigo-400 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700'
            }`}
          >
            {loading ? (
              <>
                <Loader2 className="animate-spin -ml-1 mr-2 h-5 w-5" />
                Đang xử lý...
              </>
            ) : (
              'Cập nhật Dữ liệu'
            )}
          </button>

          {!showDeleteConfirm ? (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              disabled={loading}
              className="text-red-600 hover:text-red-800 text-sm font-medium underline"
            >
              Xóa toàn bộ dữ liệu
            </button>
          ) : (
            <div className="flex items-center space-x-2 bg-red-50 p-2 rounded-md border border-red-200">
              <span className="text-sm text-red-800 font-medium">Chắc chắn xóa?</span>
              <button onClick={handleDeleteAll} className="px-3 py-1 bg-red-600 text-white text-sm rounded hover:bg-red-700">Có</button>
              <button onClick={() => setShowDeleteConfirm(false)} className="px-3 py-1 bg-gray-200 text-gray-800 text-sm rounded hover:bg-gray-300">Hủy</button>
            </div>
          )}
        </div>

        {status && (
          <div className={`mt-6 p-4 rounded-md flex items-start ${
            status.type === 'success' ? 'bg-green-50 text-green-800' :
            status.type === 'error' ? 'bg-red-50 text-red-800' :
            'bg-blue-50 text-blue-800'
          }`}>
            {status.type === 'success' && <CheckCircle className="h-5 w-5 mr-2 flex-shrink-0" />}
            {status.type === 'error' && <AlertCircle className="h-5 w-5 mr-2 flex-shrink-0" />}
            {status.type === 'info' && <Loader2 className="animate-spin h-5 w-5 mr-2 flex-shrink-0" />}
            <p className="text-sm font-medium">{status.message}</p>
          </div>
        )}

        {stats && status?.type === 'success' && (
          <div className="mt-6 grid grid-cols-2 gap-4">
            <div className="bg-indigo-50 p-4 rounded-lg border border-indigo-100">
              <p className="text-sm text-indigo-600 font-medium">Tổng số tiết dạy</p>
              <p className="text-3xl font-bold text-indigo-900">{stats.schedules}</p>
            </div>
            <div className="bg-emerald-50 p-4 rounded-lg border border-emerald-100">
              <p className="text-sm text-emerald-600 font-medium">Tổng số giáo viên</p>
              <p className="text-3xl font-bold text-emerald-900">{stats.teachers}</p>
            </div>
          </div>
        )}

        {combinedClasses.length > 0 && status?.type === 'success' && (
          <div className="mt-8 bg-amber-50 p-6 rounded-xl border border-amber-200">
            <h3 className="text-lg font-bold text-amber-900 mb-4 flex items-center">
              <AlertCircle className="mr-2 h-5 w-5 text-amber-600" />
              Báo cáo Lớp ghép (Dạy chung)
            </h3>
            <p className="text-sm text-amber-800 mb-4">
              Hệ thống phát hiện {combinedClasses.length} trường hợp giáo viên dạy nhiều lớp cùng một lúc. 
              Nếu trường bạn không có lớp ghép, nguyên nhân có thể do phần mềm xếp thời khóa biểu 
              đánh số tiết buổi chiều từ 1 đến 5 (thay vì 6 đến 10) khiến hệ thống hiểu nhầm tiết sáng và chiều trùng nhau.
            </p>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-amber-200">
                <thead className="bg-amber-100">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-amber-800 uppercase tracking-wider">Giáo viên</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-amber-800 uppercase tracking-wider">Môn</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-amber-800 uppercase tracking-wider">Lớp ghép</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-amber-800 uppercase tracking-wider">Thời gian</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-amber-100">
                  {combinedClasses.map((c, idx) => (
                    <tr key={idx}>
                      <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-900 font-medium">{c.giao_vien}</td>
                      <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-600">{c.mon}</td>
                      <td className="px-4 py-2 whitespace-nowrap text-sm text-amber-700 font-bold">{c.lop}</td>
                      <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-600">Thứ {c.thu}, Tiết {c.tiet} ({c.buoi})</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

import React, { useState, useEffect } from 'react';
import { parseExcelFile } from '../services/excelParser';
import { scheduleService } from '../services/scheduleService';
import { teacherService } from '../services/teacherService';
import { Upload, FileSpreadsheet, CheckCircle, AlertCircle, Loader2, Trash2, Tag, Edit2, Check, X } from 'lucide-react';

export const AdminDashboard: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [versionName, setVersionName] = useState(''); 
  const [status, setStatus] = useState<{ type: 'success' | 'error' | 'info', message: string } | null>(null);
  const [stats, setStats] = useState<{ schedules: number, teachers: number } | null>(null);
  const [combinedClasses, setCombinedClasses] = useState<any[]>([]);
  const [existingVersions, setExistingVersions] = useState<string[]>([]); 

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  
  // 🔥 STATES CHO TÍNH NĂNG ĐỔI TÊN PHIÊN BẢN
  const [editingVersion, setEditingVersion] = useState<string | null>(null);
  const [newVersionName, setNewVersionName] = useState('');

  const fetchVersions = async () => {
    try {
      const schedules = await scheduleService.getAllSchedules();
      const versions = Array.from(new Set(schedules.map(s => s.versionName || 'Không rõ'))).sort();
      setExistingVersions(versions);
    } catch (error) {
      console.error("Lỗi tải phiên bản:", error);
    }
  };

  useEffect(() => {
    fetchVersions();
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setStatus(null);
      if (!versionName) {
        setVersionName(e.target.files[0].name.replace(/\.[^/.]+$/, ""));
      }
    }
  };

  const handleUpload = async () => {
    if (!file || !versionName.trim()) {
      setStatus({ type: 'error', message: 'Vui lòng chọn file và nhập tên phiên bản.' });
      return;
    }

    setLoading(true);
    setStatus({ type: 'info', message: 'Đang đọc và gắn nhãn phiên bản...' });

    try {
      const { schedules, teachers } = await parseExcelFile(file);
      const labeledSchedules = schedules.map(s => ({
        ...s,
        versionName: versionName.trim()
      }));

      const combined = schedules.filter(s => s.lop.includes(','));
      setCombinedClasses(combined);

      setStats({ schedules: labeledSchedules.length, teachers: teachers.length });
      
      await teacherService.saveTeachers(teachers);
      await scheduleService.saveSchedules(labeledSchedules); 

      setStatus({ type: 'success', message: `Đã cập nhật "${versionName}" thành công!` });
      setVersionName('');
      setFile(null);
      fetchVersions(); 
    } catch (error: any) {
      console.error(error);
      setStatus({ type: 'error', message: `Lỗi: ${error.message || 'Không thể xử lý dữ liệu.'}` });
    } finally {
      setLoading(false);
    }
  };

  // 🔥 HÀM XỬ LÝ ĐỔI TÊN
  const handleRenameVersion = async (oldName: string) => {
    if (!newVersionName.trim() || newVersionName === oldName) {
      setEditingVersion(null);
      return;
    }

    setLoading(true);
    try {
      await scheduleService.renameVersion(oldName, newVersionName.trim());
      setStatus({ type: 'success', message: `Đã đổi tên thành "${newVersionName}" thành công!` });
      setEditingVersion(null);
      setNewVersionName('');
      fetchVersions();
    } catch (error: any) {
      setStatus({ type: 'error', message: `Lỗi khi đổi tên: ${error.message}` });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteVersion = async (vName: string) => {
    if (!window.confirm(`Bạn có chắc chắn muốn xóa toàn bộ dữ liệu của "${vName}"?`)) return;
    
    setLoading(true);
    try {
      await scheduleService.deleteScheduleByVersion(vName);
      setStatus({ type: 'success', message: `Đã xóa phiên bản: ${vName}` });
      fetchVersions();
    } catch (error: any) {
      setStatus({ type: 'error', message: `Lỗi khi xóa: ${error.message}` });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteAll = async () => {
    setLoading(true);
    try {
      await scheduleService.deleteAllSchedules();
      setStatus({ type: 'success', message: 'Đã dọn dẹp toàn bộ dữ liệu hệ thống.' });
      setStats(null);
      setExistingVersions([]);
      setShowDeleteConfirm(false);
    } catch (error: any) {
      setStatus({ type: 'error', message: `Lỗi khi xóa: ${error.message}` });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-10">
      <div className="bg-white p-8 rounded-xl shadow-sm border border-gray-200">
        <h2 className="text-2xl font-bold text-gray-800 mb-6 flex items-center">
          <Upload className="mr-2 text-indigo-600" /> Nhập dữ liệu TKB Mới
        </h2>

        <div className="space-y-4 mb-6">
          <label className="block">
            <span className="text-sm font-bold text-gray-700 flex items-center mb-2">
              <Tag className="w-4 h-4 mr-2" /> Tên phiên bản Thời khóa biểu:
            </span>
            <input 
              type="text"
              placeholder="Ví dụ: TKB Số 1, Học kỳ 2 Đợt 1..."
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              value={versionName}
              onChange={(e) => setVersionName(e.target.value)}
            />
          </label>

          <div className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center hover:bg-gray-50 transition-colors">
            <FileSpreadsheet className="mx-auto h-12 w-12 text-gray-400 mb-4" />
            <input
              type="file"
              accept=".xlsx, .xls"
              onChange={handleFileChange}
              className="hidden"
              id="file-upload"
            />
            <label
              htmlFor="file-upload"
              className="cursor-pointer inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700"
            >
              Chọn file Excel TKB
            </label>
            {file && <p className="mt-4 text-sm font-medium text-indigo-600 italic">Đã chọn: {file.name}</p>}
          </div>
        </div>

        <div className="flex justify-between items-center">
          <button
            onClick={handleUpload}
            disabled={!file || !versionName || loading}
            className={`inline-flex items-center px-6 py-3 rounded-md shadow-sm text-white font-bold transition-all ${
              !file || !versionName || loading ? 'bg-gray-400 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700 active:scale-95'
            }`}
          >
            {loading ? <><Loader2 className="animate-spin mr-2 h-5 w-5" /> Đang tải...</> : 'Tải lên hệ thống'}
          </button>

          {!showDeleteConfirm ? (
            <button onClick={() => setShowDeleteConfirm(true)} disabled={loading} className="text-red-600 hover:text-red-800 text-sm font-medium underline">
              Xóa sạch dữ liệu
            </button>
          ) : (
            <div className="flex items-center space-x-2 bg-red-50 p-2 rounded-md border border-red-200">
              <span className="text-sm text-red-800 font-bold px-2">Xóa sạch 100%?</span>
              <button onClick={handleDeleteAll} className="px-3 py-1 bg-red-600 text-white text-sm rounded-md hover:bg-red-700">Có</button>
              <button onClick={() => setShowDeleteConfirm(false)} className="px-3 py-1 bg-white text-gray-800 text-sm rounded-md border border-gray-300">Hủy</button>
            </div>
          )}
        </div>

        {status && (
          <div className={`mt-6 p-4 rounded-lg flex items-start animate-in slide-in-from-top-2 ${
            status.type === 'success' ? 'bg-green-50 text-green-800 border border-green-200' :
            status.type === 'error' ? 'bg-red-50 text-red-800 border border-red-200' : 'bg-blue-50 text-blue-800 border border-blue-200'
          }`}>
            {status.type === 'success' ? <CheckCircle className="h-5 w-5 mr-2 flex-shrink-0" /> : <AlertCircle className="h-5 w-5 mr-2 flex-shrink-0" />}
            <p className="text-sm font-bold">{status.message}</p>
          </div>
        )}
      </div>

      <div className="bg-white p-8 rounded-xl shadow-sm border border-gray-200">
        <h3 className="text-xl font-bold text-gray-800 mb-4 flex items-center">
          <Tag className="mr-2 text-amber-500" /> Các phiên bản TKB hiện có
        </h3>
        {existingVersions.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {existingVersions.map(v => (
              <div key={v} className="flex justify-between items-center p-4 bg-gray-50 rounded-xl border border-gray-200 hover:border-indigo-300 transition-all group">
                <div className="flex-1 flex items-center">
                  {editingVersion === v ? (
                    <div className="flex items-center space-x-2 w-full pr-4">
                      <input 
                        autoFocus
                        className="flex-1 px-2 py-1 border border-indigo-500 rounded text-sm font-bold"
                        value={newVersionName}
                        onChange={(e) => setNewVersionName(e.target.value)}
                        placeholder="Nhập tên mới..."
                      />
                      <button onClick={() => handleRenameVersion(v)} className="p-1 text-green-600 hover:bg-green-100 rounded"><Check className="w-4 h-4" /></button>
                      <button onClick={() => setEditingVersion(null)} className="p-1 text-red-600 hover:bg-red-100 rounded"><X className="w-4 h-4" /></button>
                    </div>
                  ) : (
                    <>
                      <span className={`font-bold ${v === 'Không rõ' ? 'text-red-500 italic' : 'text-gray-700'}`}>{v}</span>
                      <button 
                        onClick={() => { setEditingVersion(v); setNewVersionName(v === 'Không rõ' ? '' : v); }}
                        className="ml-3 p-1 text-gray-400 hover:text-indigo-600 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                    </>
                  )}
                </div>
                
                {editingVersion !== v && (
                  <button 
                    onClick={() => handleDeleteVersion(v)}
                    className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-full transition-colors opacity-0 group-hover:opacity-100"
                    title="Xóa phiên bản này"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-500 text-sm italic">Chưa có phiên bản nào được tải lên.</p>
        )}
      </div>

      {combinedClasses.length > 0 && status?.type === 'success' && (
        <div className="bg-amber-50 p-6 rounded-xl border border-amber-200">
          <h3 className="text-lg font-bold text-amber-900 mb-2 flex items-center">
            <AlertCircle className="mr-2 h-5 w-5 text-amber-600" /> Báo cáo Lớp ghép
          </h3>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-amber-200">
              <thead className="bg-amber-100">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-amber-800 uppercase">Giáo viên</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-amber-800 uppercase">Môn</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-amber-800 uppercase">Lớp ghép</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-amber-100">
                {combinedClasses.map((c, idx) => (
                  <tr key={idx}>
                    <td className="px-4 py-2 text-sm text-gray-900 font-medium">{c.giao_vien}</td>
                    <td className="px-4 py-2 text-sm text-gray-600">{c.mon}</td>
                    <td className="px-4 py-2 text-sm text-amber-700 font-bold">{c.lop}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

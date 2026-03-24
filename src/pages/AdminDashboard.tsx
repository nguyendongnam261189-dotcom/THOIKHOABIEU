import React, { useState, useEffect, useMemo } from 'react';
import { parseExcelFile } from '../services/excelParser';
import { scheduleService } from '../services/scheduleService';
import { teacherService } from '../services/teacherService';
import { Upload, FileSpreadsheet, CheckCircle, AlertCircle, Loader2, Trash2, Tag, Edit2, Check, X, Save, Plus, BarChart3 } from 'lucide-react';
import { Schedule, Teacher } from '../types';
import * as XLSX from 'xlsx';

export const AdminDashboard: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [versionName, setVersionName] = useState(''); 
  const [status, setStatus] = useState<{ type: 'success' | 'error' | 'info', message: string } | null>(null);
  
  const [allSchedules, setAllSchedules] = useState<Schedule[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [versionConfigs, setVersionConfigs] = useState<any[]>([]);
  const [selectedKTLops, setSelectedKTLops] = useState<string[]>([]);

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [editingVersion, setEditingVersion] = useState<string | null>(null);
  const [newVersionName, setNewVersionName] = useState('');

  const loadData = async () => {
    try {
      const [s, t, c] = await Promise.all([
        scheduleService.getAllSchedules(),
        teacherService.getAllTeachers(),
        scheduleService.getVersionConfigs()
      ]);
      setAllSchedules(s);
      setTeachers(t);
      setVersionConfigs(c);
    } catch (error) {
      console.error("Lỗi tải dữ liệu:", error);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const versions = useMemo(() => {
    const names = Array.from(new Set(allSchedules.map(s => s.versionName || 'Không rõ'))).sort();
    return names.map(name => {
      const config = versionConfigs.find(c => c.versionName === name);
      return { name, weeks: config?.appliedWeeks || 0 };
    });
  }, [allSchedules, versionConfigs]);

  const allClassNames = useMemo(() => {
    const set = new Set<string>();
    allSchedules.forEach(s => {
      if (s.lop) {
        s.lop.split(', ').forEach(l => set.add(l.trim()));
      }
    });
    return Array.from(set).sort();
  }, [allSchedules]);

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
    try {
      const { schedules, teachers } = await parseExcelFile(file);
      const labeledSchedules = schedules.map(s => ({ ...s, versionName: versionName.trim() }));
      await teacherService.saveTeachers(teachers);
      await scheduleService.saveSchedules(labeledSchedules); 
      setStatus({ type: 'success', message: `Đã cập nhật "${versionName}" thành công!` });
      setVersionName('');
      setFile(null);
      loadData();
    } catch (error: any) {
      setStatus({ type: 'error', message: `Lỗi: ${error.message || 'Không thể xử lý dữ liệu.'}` });
    } finally {
      setLoading(false);
    }
  };

  const handleSaveWeeks = async (vName: string, weeks: number) => {
    try {
      await scheduleService.saveVersionWeeks(vName, weeks);
      loadData();
    } catch (error) {
      alert("Không thể lưu số tuần.");
    }
  };

  const handleRenameVersion = async (oldName: string) => {
    if (!newVersionName.trim() || newVersionName === oldName) {
      setEditingVersion(null);
      return;
    }
    setLoading(true);
    try {
      await scheduleService.renameVersion(oldName, newVersionName.trim());
      setEditingVersion(null);
      setNewVersionName('');
      loadData();
    } catch (error: any) {
      setStatus({ type: 'error', message: `Lỗi khi đổi tên: ${error.message}` });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteVersion = async (vName: string) => {
    if (!window.confirm(`Bạn có chắc muốn xóa "${vName}"?`)) return;
    setLoading(true);
    try {
      await scheduleService.deleteScheduleByVersion(vName);
      loadData();
    } catch (error: any) {
      setStatus({ type: 'error', message: `Lỗi: ${error.message}` });
    } finally {
      setLoading(false);
    }
  };

  // 🔥 HÀM XUẤT BÁO CÁO CẢI TIẾN: ĐỊNH DẠNG ĐẸP + MULTI-SHEETS
  const exportIntegratedReport = () => {
    const wb = XLSX.utils.book_new();
    const ktLopSet = new Set(selectedKTLops);
    const summaryData: any[] = [];
    const depts = Array.from(new Set(teachers.map(t => t.group || 'Chung'))).sort();

    let grandTotal = 0;

    depts.forEach(dept => {
      const deptTeachers = teachers.filter(t => (t.group || 'Chung') === dept);
      const rows: any[] = [];
      let deptTotal = 0;

      deptTeachers.forEach((teacher, idx) => {
        let teacherTotalKT = 0;
        let detailsArr: string[] = [];
        let classesTaughtSet = new Set<string>();

        versions.forEach(v => {
          if (v.weeks <= 0) return;
          const vPeriods = allSchedules.filter(s => 
            s.versionName === v.name && 
            s.giao_vien === teacher.name && 
            s.lop.split(', ').some(l => ktLopSet.has(l.trim()))
          );
          
          if (vPeriods.length > 0) {
            const subTotal = vPeriods.length * v.weeks;
            teacherTotalKT += subTotal;
            const classCountMap: Record<string, number> = {};
            vPeriods.forEach(p => {
              p.lop.split(', ').map(l => l.trim()).filter(l => ktLopSet.has(l)).forEach(ml => {
                const cleanLop = ml.replace(/\./g, '/');
                classCountMap[cleanLop] = (classCountMap[cleanLop] || 0) + 1;
                classesTaughtSet.add(cleanLop);
              });
            });
            const classDetailStr = Object.entries(classCountMap).map(([l, c]) => `${c} tiết lớp ${l}`).join(' + ');
            detailsArr.push(`[${classDetailStr}] x ${v.weeks} tuần (${v.name})`);
          }
        });

        if (teacherTotalKT > 0) {
          rows.push({
            'STT': rows.length + 1,
            'Họ và tên': teacher.name,
            'Lớp dạy': Array.from(classesTaughtSet).join(', '),
            'Số tiết': teacherTotalKT,
            'Diễn giải chi tiết': detailsArr.join(' + ') + ` = ${teacherTotalKT} tiết`
          });
          deptTotal += teacherTotalKT;
        }
      });

      if (rows.length > 0) {
        // Thêm dòng tổng cộng tổ vào sheet tổ
        rows.push({ 'STT': '', 'Họ và tên': 'TỔNG CỘNG TỔ', 'Lớp dạy': '', 'Số tiết': deptTotal, 'Diễn giải chi tiết': '' });
        
        const ws = XLSX.utils.json_to_sheet([]);
        XLSX.utils.sheet_add_aoa(ws, [[`BÁO CÁO TIẾT DẠY LỚP KHUYẾT TẬT - TỔ: ${dept.toUpperCase()}`]], { origin: 'A1' });
        XLSX.utils.sheet_add_json(ws, rows, { origin: 'A3' });

        // Căn chỉnh độ rộng cột
        ws['!cols'] = [{ wch: 5 }, { wch: 25 }, { wch: 20 }, { wch: 10 }, { wch: 60 }];
        XLSX.utils.book_append_sheet(wb, ws, `Tổ ${dept.substring(0, 20)}`);
        
        // Lưu vào data tổng hợp
        summaryData.push({ 'STT': summaryData.length + 1, 'Tổ chuyên môn': dept, 'Tổng số tiết': deptTotal });
        grandTotal += deptTotal;
      }
    });

    // TẠO SHEET TỔNG HỢP TOÀN TRƯỜNG (CHỈ CÓ TỔ)
    const summaryRows = [
      ['BÁO CÁO TỔNG HỢP TIẾT DẠY LỚP KHUYẾT TẬT TOÀN TRƯỜNG'],
      [`Ngày xuất: ${new Date().toLocaleDateString('vi-VN')}`],
      [],
      ['STT', 'Tổ chuyên môn', 'Tổng số tiết']
    ];
    summaryData.forEach(item => summaryRows.push([item.STT, item['Tổ chuyên môn'], item['Tổng số tiết']]));
    summaryRows.push(['', 'TỔNG CỘNG TOÀN TRƯỜNG', grandTotal]);

    const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
    wsSummary['!cols'] = [{ wch: 5 }, { wch: 40 }, { wch: 20 }];
    XLSX.utils.book_insert_sheet(wb, wsSummary, 'TỔNG HỢP TOÀN TRƯỜNG', 0);

    XLSX.writeFile(wb, `Bao_Cao_Che_Do_Khuyet_Tat.xlsx`);
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-10 px-4">
      {/* 1. KHU VỰC UPLOAD */}
      <div className="bg-white p-6 md:p-8 rounded-2xl shadow-sm border border-gray-200">
        <h2 className="text-2xl font-bold text-gray-800 mb-6 flex items-center">
          <Upload className="mr-2 text-indigo-600" /> Nhập dữ liệu TKB Mới
        </h2>
        <div className="space-y-4 mb-6">
          <label className="block">
            <span className="text-sm font-bold text-gray-700 flex items-center mb-2">
              <Tag className="w-4 h-4 mr-2" /> Tên phiên bản:
            </span>
            <input 
              type="text"
              placeholder="Ví dụ: TKB Số 8..."
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
              value={versionName}
              onChange={(e) => setVersionName(e.target.value)}
            />
          </label>
          <div className="border-2 border-dashed border-gray-300 rounded-xl p-6 text-center hover:bg-gray-50 transition-colors">
            <FileSpreadsheet className="mx-auto h-10 w-10 text-gray-400 mb-3" />
            <input type="file" accept=".xlsx, .xls" onChange={handleFileChange} className="hidden" id="file-upload" />
            <label htmlFor="file-upload" className="cursor-pointer inline-flex items-center px-4 py-2 text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 shadow-sm">
              Chọn file Excel
            </label>
            {file && <p className="mt-3 text-sm text-indigo-600 font-medium italic">File: {file.name}</p>}
          </div>
        </div>
        <div className="flex justify-between items-center">
          <button onClick={handleUpload} disabled={!file || !versionName || loading} className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-400 text-white px-6 py-2.5 rounded-lg font-bold shadow-md transition-all">
            {loading ? 'Đang xử lý...' : 'Tải lên hệ thống'}
          </button>
          {!showDeleteConfirm ? (
            <button onClick={() => setShowDeleteConfirm(true)} className="text-red-600 text-sm font-medium underline">Xóa sạch dữ liệu</button>
          ) : (
            <div className="flex items-center space-x-2 bg-red-50 p-2 rounded-md border border-red-200">
              <span className="text-xs text-red-800 font-bold px-2">Xóa sạch 100%?</span>
              <button onClick={async () => { await scheduleService.deleteAllSchedules(); loadData(); setShowDeleteConfirm(false); }} className="px-2 py-1 bg-red-600 text-white text-xs rounded">Có</button>
              <button onClick={() => setShowDeleteConfirm(false)} className="px-2 py-1 bg-white text-gray-800 text-xs rounded border">Hủy</button>
            </div>
          )}
        </div>
      </div>

      {/* 2. QUẢN LÝ PHIÊN BẢN */}
      <div className="bg-white p-6 md:p-8 rounded-2xl shadow-sm border border-gray-200">
        <h3 className="text-xl font-bold text-gray-800 mb-6 flex items-center">
          <Save className="mr-2 text-amber-500" /> Quản lý Phiên bản & Số tuần dạy thực tế
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {versions.map(v => (
            <div key={v.name} className="flex flex-col p-4 bg-gray-50 rounded-xl border border-gray-200 group">
              <div className="flex justify-between items-center mb-3">
                {editingVersion === v.name ? (
                  <div className="flex items-center gap-2 flex-1 mr-2">
                    <input autoFocus className="flex-1 px-2 py-1 border border-indigo-500 rounded text-sm font-bold" value={newVersionName} onChange={e => setNewVersionName(e.target.value)} />
                    <button onClick={() => handleRenameVersion(v.name)} className="text-green-600"><Check className="w-4 h-4" /></button>
                  </div>
                ) : (
                  <div className="flex items-center">
                    <span className="font-bold text-gray-700">{v.name}</span>
                    <button onClick={() => { setEditingVersion(v.name); setNewVersionName(v.name); }} className="ml-2 text-gray-400 hover:text-indigo-600 opacity-0 group-hover:opacity-100"><Edit2 className="w-3 h-3" /></button>
                  </div>
                )}
                <button onClick={() => handleDeleteVersion(v.name)} className="text-red-400 hover:text-red-600 opacity-0 group-hover:opacity-100"><Trash2 className="w-4 h-4" /></button>
              </div>
              <div className="flex items-center gap-3 bg-white p-2 rounded-lg border border-gray-100">
                <span className="text-xs font-medium text-gray-500">Dạy trong:</span>
                <input 
                  type="number" 
                  className="w-16 border-b-2 border-indigo-200 focus:border-indigo-500 outline-none text-center font-bold text-indigo-700" 
                  defaultValue={v.weeks}
                  onBlur={(e) => handleSaveWeeks(v.name, parseInt(e.target.value) || 0)}
                />
                <span className="text-xs text-gray-500 italic">tuần</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 3. XUẤT BÁO CÁO KHUYẾT TẬT */}
      <div className="bg-white p-6 md:p-8 rounded-2xl shadow-sm border border-emerald-200">
        <div className="flex items-center justify-between mb-6">
            <h3 className="text-xl font-bold text-emerald-800 flex items-center">
              <BarChart3 className="mr-2 text-emerald-600" /> Xuất báo cáo Chế độ Khuyết tật
            </h3>
            <span className="bg-emerald-100 text-emerald-700 px-3 py-1 rounded-full text-xs font-bold">
                Đã chọn {selectedKTLops.length} lớp
            </span>
        </div>

        <p className="text-sm text-gray-600 mb-4 italic">Bấm chọn các lớp có học sinh khuyết tật để tính toán:</p>
        <div className="flex flex-wrap gap-2 mb-8 max-h-48 overflow-y-auto p-4 bg-gray-50 rounded-xl border border-gray-100">
          {allClassNames.map(lop => (
            <button
              key={lop}
              onClick={() => setSelectedKTLops(prev => prev.includes(lop) ? prev.filter(l => l !== lop) : [...prev, lop])}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${
                selectedKTLops.includes(lop) 
                  ? 'bg-emerald-600 text-white border-emerald-600 shadow-md' 
                  : 'bg-white text-gray-600 border-gray-200 hover:border-emerald-400'
              }`}
            >
              {lop.replace(/\./g, '/')}
            </button>
          ))}
        </div>

        <button
          onClick={exportIntegratedReport}
          disabled={selectedKTLops.length === 0 || versions.every(v => v.weeks === 0)}
          className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-300 text-white py-4 rounded-xl font-bold flex items-center justify-center shadow-lg transition-all text-lg"
        >
          <FileSpreadsheet className="mr-2 h-6 w-6" /> TẢI FILE BÁO CÁO ĐỊNH DẠNG ĐẸP
        </button>
        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4 text-[11px] text-gray-500 uppercase font-bold tracking-wider">
            <div className="flex items-start"><CheckCircle className="w-3 h-3 mr-2 text-emerald-500 shrink-0 mt-0.5" /> File Excel nhiều Sheets chuyên nghiệp</div>
            <div className="flex items-start"><CheckCircle className="w-3 h-3 mr-2 text-emerald-500 shrink-0 mt-0.5" /> Sheet Tổng hợp toàn trường theo Tổ</div>
        </div>
      </div>
    </div>
  );
};

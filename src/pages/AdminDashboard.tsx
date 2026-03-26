import React, { useState, useEffect, useMemo } from 'react';
import { parseExcelFile } from '../services/excelParser';
import { scheduleService } from '../services/scheduleService';
import { teacherService } from '../services/teacherService';
import { Upload, FileSpreadsheet, CheckCircle, AlertCircle, Loader2, Trash2, Tag, Edit2, Check, X, Save, Plus, BarChart3, Calendar } from 'lucide-react';
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
  const [totalTermWeeks, setTotalTermWeeks] = useState<number>(18);

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [editingVersion, setEditingVersion] = useState<string | null>(null);
  const [newVersionName, setNewVersionName] = useState('');

  const loadData = async () => {
    try {
      // 🛡️ Kiểm tra sự tồn tại của các hàm trước khi gọi để tránh treo App
      const [s, t, c, termCfg] = await Promise.all([
        scheduleService.getAllSchedules(),
        teacherService.getAllTeachers(),
        scheduleService.getVersionConfigs(),
        scheduleService.getTermConfig ? scheduleService.getTermConfig() : Promise.resolve(null)
      ]);
      
      setAllSchedules(s || []);
      setTeachers(t || []);
      setVersionConfigs(c || []);
      
      if (termCfg) {
        setTotalTermWeeks(termCfg.totalWeeks || 18);
        setSelectedKTLops(termCfg.ktLops || []);
      }
    } catch (error) {
      console.error("Lỗi tải dữ liệu:", error);
    }
  };

  useEffect(() => { loadData(); }, []);

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
      const { schedules, teachers: parsedTeachers } = await parseExcelFile(file);
      
      // Gắn tên phiên bản vào từng tiết dạy
      const labeledSchedules = schedules.map(s => ({ ...s, versionName: versionName.trim() }));
      
      // 🛡️ Thực hiện lưu trữ tuần tự để đảm bảo tính ổn định
      await teacherService.saveTeachers(parsedTeachers);
      await scheduleService.saveSchedules(labeledSchedules); 
      
      setStatus({ type: 'success', message: `Đã tải lên phiên bản ${versionName} thành công!` });
      setVersionName('');
      setFile(null);
      await loadData();
    } catch (error: any) {
      console.error("Lỗi Upload:", error);
      setStatus({ type: 'error', message: `Lỗi xử lý dữ liệu TKB.` });
    } finally {
      setLoading(false);
    }
  };

  const handleSaveTermConfig = async () => {
    try {
      if (scheduleService.saveTermConfig) {
        await scheduleService.saveTermConfig(totalTermWeeks, selectedKTLops);
        alert("Đã lưu cấu hình học kỳ và danh sách lớp khuyết tật!");
      }
    } catch (error) {
      alert("Lỗi khi lưu cấu hình học kỳ.");
    }
  };

  const handleSaveWeeks = async (vName: string, weeks: number) => {
    try {
      await scheduleService.saveVersionWeeks(vName, weeks);
      loadData();
    } catch (error) {
      alert("Lỗi lưu số tuần.");
    }
  };

  const handleRenameVersion = async (oldName: string, newName: string) => {
    setLoading(true);
    try {
      await scheduleService.renameVersion(oldName, newName.trim());
      setEditingVersion(null);
      loadData();
    } catch (error: any) {
      setStatus({ type: 'error', message: `Lỗi đổi tên phiên bản.` });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteVersion = async (vName: string) => {
    if (!window.confirm(`Bạn có chắc chắn muốn xóa phiên bản "${vName}"?`)) return;
    setLoading(true);
    try {
      await scheduleService.deleteScheduleByVersion(vName);
      loadData();
    } catch (error: any) {
      setStatus({ type: 'error', message: `Lỗi xóa dữ liệu phiên bản.` });
    } finally {
      setLoading(false);
    }
  };

  const isHDTNType = (subject: string): boolean => {
    const s = (subject || '').toUpperCase();
    return s.includes('HDTN') || s.includes('HĐTN') || 
           s.includes('CHÀO CỜ') || s.includes('CC-') || 
           s.includes('SHL') || s.includes('SINH HOẠT');
  };

  const exportIntegratedReport = () => {
    try {
      const wb = XLSX.utils.book_new();
      const ktLopSet = new Set(selectedKTLops);
      const summaryData: any[] = [];
      const depts = Array.from(new Set(teachers.map(t => t.group || 'Chung'))).sort();
      let grandTotal = 0;

      depts.forEach(dept => {
        const deptTeachers = teachers.filter(t => (t.group || 'Chung') === dept);
        const rows: any[] = [];
        let deptTotal = 0;

        deptTeachers.forEach((teacher) => {
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
            if (vPeriods.length === 0) return;
            const classesAsCN = new Set<string>();
            vPeriods.forEach(p => {
              if (isHDTNType(p.mon)) {
                p.lop.split(', ').map(l => l.trim()).filter(l => ktLopSet.has(l)).forEach(ml => classesAsCN.add(ml));
              }
            });
            const normalPeriods = vPeriods.filter(p => !isHDTNType(p.mon));
            const classCountMap: Record<string, number> = {};
            let subTotalVersion = 0;
            normalPeriods.forEach(p => {
              p.lop.split(', ').map(l => l.trim()).filter(l => ktLopSet.has(l)).forEach(ml => {
                const cleanLop = ml.replace(/\./g, '/');
                classCountMap[cleanLop] = (classCountMap[cleanLop] || 0) + 1;
                classesTaughtSet.add(cleanLop);
                subTotalVersion += 1;
              });
            });
            classesAsCN.forEach(ml => {
              const cleanLop = ml.replace(/\./g, '/');
              const key = `HĐTN (CN) lớp ${cleanLop}`;
              classCountMap[key] = 3;
              classesTaughtSet.add(cleanLop);
              subTotalVersion += 3;
            });
            if (subTotalVersion > 0) {
              teacherTotalKT += (subTotalVersion * v.weeks);
              const detailStr = Object.entries(classCountMap).map(([l, c]) => `${c}t ${l}`).join(' + ');
              detailsArr.push(`[${detailStr}] x ${v.weeks} tuần`);
            }
          });
          if (teacherTotalKT > 0) {
            rows.push({
              'STT': rows.length + 1,
              'Họ và tên': teacher.name,
              'Lớp dạy': Array.from(classesTaughtSet).join(', '),
              'Số tiết': teacherTotalKT,
              'Công thức tính': detailsArr.join(' + ') + ` = ${teacherTotalKT} tiết`
            });
            deptTotal += teacherTotalKT;
          }
        });

        if (rows.length > 0) {
          summaryData.push({ 'STT': summaryData.length + 1, 'Tổ chuyên môn': dept, 'Tổng số tiết': deptTotal });
          grandTotal += deptTotal;
          rows.push({ 'STT': '', 'Họ và tên': 'TỔNG CỘNG TỔ', 'Lớp dạy': '', 'Số tiết': deptTotal, 'Công thức tính': '' });
          const ws = XLSX.utils.json_to_sheet([]);
          XLSX.utils.sheet_add_aoa(ws, [[`BÁO CÁO TIẾT DẠY LỚP KHUYẾT TẬT - TỔ: ${dept.toUpperCase()}`]], { origin: 'A1' });
          XLSX.utils.sheet_add_json(ws, rows, { origin: 'A3' });
          ws['!cols'] = [{ wch: 5 }, { wch: 25 }, { wch: 20 }, { wch: 10 }, { wch: 80 }];
          XLSX.utils.book_append_sheet(wb, ws, `Tổ ${dept.substring(0, 20)}`);
        }
      });

      const summaryRows = [['BÁO CÁO TỔNG HỢP TIẾT DẠY LỚP KHUYẾT TẬT'], [`Ngày xuất: ${new Date().toLocaleDateString('vi-VN')}`], [], ['STT', 'Tổ chuyên môn', 'Tổng số tiết']];
      summaryData.forEach(item => summaryRows.push([item.STT, item['Tổ chuyên môn'], item['Tổng số tiết']]));
      summaryRows.push(['', 'TỔNG CỘNG TOÀN TRƯỜNG', grandTotal]);
      const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
      wsSummary['!cols'] = [{ wch: 5 }, { wch: 40 }, { wch: 20 }];
      const finalWb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(finalWb, wsSummary, 'TỔNG HỢP TOÀN TRƯỜNG');
      wb.SheetNames.forEach(name => XLSX.utils.book_append_sheet(finalWb, wb.Sheets[name], name));
      XLSX.writeFile(finalWb, `Bao_Cao_Tong_Hop_Khuyet_Tat.xlsx`);
    } catch (err) { alert("Lỗi xuất file báo cáo."); }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-10 px-4">
      {/* 1. UPLOAD SECTION */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
        <h2 className="text-2xl font-bold text-gray-800 mb-6 flex items-center"><Upload className="mr-2 text-indigo-600" /> Nhập dữ liệu TKB</h2>
        
        {status && (
          <div className={`mb-4 p-4 rounded-lg flex items-center ${status.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
            {status.type === 'success' ? <CheckCircle className="mr-2 w-5 h-5" /> : <AlertCircle className="mr-2 w-5 h-5" />}
            {status.message}
          </div>
        )}

        <div className="space-y-4 mb-6">
          <label className="block">
            <span className="text-sm font-bold text-gray-700 flex items-center mb-2"><Tag className="w-4 h-4 mr-2" /> Tên phiên bản:</span>
            <input type="text" placeholder="Ví dụ: TKB SỐ 7..." className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" value={versionName} onChange={(e) => setVersionName(e.target.value)} />
          </label>
          <div className="border-2 border-dashed border-gray-300 rounded-xl p-6 text-center hover:bg-gray-50 transition-colors">
            <FileSpreadsheet className="mx-auto h-10 w-10 text-gray-400 mb-3" />
            <input type="file" accept=".xlsx, .xls" onChange={handleFileChange} className="hidden" id="file-upload" />
            <label htmlFor="file-upload" className="cursor-pointer inline-flex items-center px-4 py-2 text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700">Chọn file Excel</label>
            {file && <p className="mt-3 text-sm text-indigo-600 font-medium italic">{file.name}</p>}
          </div>
        </div>
        <div className="flex justify-between items-center">
          <button onClick={handleUpload} disabled={!file || !versionName || loading} className="bg-indigo-600 text-white px-6 py-2.5 rounded-lg font-bold shadow-md hover:bg-indigo-700 disabled:bg-gray-300 transition-all flex items-center">
            {loading && <Loader2 className="animate-spin mr-2 w-4 h-4" />}
            {loading ? 'Đang xử lý...' : 'Tải lên hệ thống'}
          </button>
          {!showDeleteConfirm ? (
            <button onClick={() => setShowDeleteConfirm(true)} className="text-red-600 text-sm underline hover:text-red-800">Xóa sạch dữ liệu</button>
          ) : (
            <div className="flex items-center space-x-2 bg-red-50 p-2 rounded-md">
              <span className="text-xs text-red-600 font-bold">Xác nhận xóa?</span>
              <button onClick={async () => { await scheduleService.deleteAllSchedules(); loadData(); setShowDeleteConfirm(false); }} className="px-2 py-1 bg-red-600 text-white text-xs rounded hover:bg-red-700">Xóa 100%</button>
              <button onClick={() => setShowDeleteConfirm(false)} className="px-2 py-1 bg-white text-xs rounded border border-gray-300">Hủy</button>
            </div>
          )}
        </div>
      </div>

      {/* 2. CẤU HÌNH HỌC KỲ & LỚP KHUYẾT TẬT */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-indigo-200">
        <h3 className="text-xl font-bold text-indigo-800 mb-6 flex items-center"><Calendar className="mr-2" /> Cấu hình Học kỳ & Lớp Khuyết tật</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            <div className="space-y-2">
                <label className="text-sm font-bold text-gray-600">Tổng số tuần của đợt kê khai:</label>
                <div className="flex items-center gap-3">
                    <input type="number" className="w-24 p-2 border rounded-lg text-center font-bold text-indigo-700" value={totalTermWeeks} onChange={(e) => setTotalTermWeeks(parseInt(e.target.value) || 0)} />
                    <span className="text-sm text-gray-500">tuần</span>
                </div>
            </div>
            <div className="flex items-end">
                <button onClick={handleSaveTermConfig} className="bg-indigo-700 text-white px-6 py-2 rounded-lg font-bold flex items-center gap-2 hover:bg-indigo-800 transition-colors">
                    <Save className="w-4 h-4" /> Lưu cấu hình chung
                </button>
            </div>
        </div>
        <p className="text-sm text-gray-600 mb-4 italic font-medium">Chọn các lớp có HS khuyết tật (dữ liệu này dùng chung toàn trường):</p>
        <div className="flex flex-wrap gap-2 mb-4 max-h-48 overflow-y-auto p-4 bg-gray-50 rounded-xl border border-gray-100">
          {allClassNames.map(lop => (
            <button key={lop} onClick={() => setSelectedKTLops(prev => prev.includes(lop) ? prev.filter(l => l !== lop) : [...prev, lop])}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${selectedKTLops.includes(lop) ? 'bg-indigo-600 text-white border-indigo-600 shadow-md' : 'bg-white text-gray-600 border-gray-200 hover:border-indigo-400'}`}>
              {lop.replace(/\./g, '/')}
            </button>
          ))}
        </div>
      </div>

      {/* 3. QUẢN LÝ PHIÊN BẢN TKB */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
        <h3 className="text-xl font-bold text-gray-800 mb-6 flex items-center"><Save className="mr-2 text-amber-500" /> Quản lý TKB & Số tuần dạy thực tế</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {versions.length > 0 ? versions.map(v => (
            <div key={v.name} className="p-4 bg-gray-50 rounded-xl border border-gray-200 group">
              <div className="flex justify-between items-center mb-3">
                {editingVersion === v.name ? (
                  <div className="flex items-center gap-2 flex-1"><input autoFocus className="flex-1 px-2 py-1 border rounded text-sm font-bold" value={newVersionName} onChange={e => setNewVersionName(e.target.value)} /><button onClick={() => handleRenameVersion(v.name, newVersionName)}><Check className="w-4 h-4 text-green-600" /></button></div>
                ) : (
                  <div className="flex items-center"><span className="font-bold text-gray-700">{v.name}</span><button onClick={() => { setEditingVersion(v.name); setNewVersionName(v.name); }} className="ml-2 text-gray-400 opacity-0 group-hover:opacity-100"><Edit2 className="w-3 h-3" /></button></div>
                )}
                <button onClick={() => handleDeleteVersion(v.name)} className="text-red-400 opacity-0 group-hover:opacity-100"><Trash2 className="w-4 h-4" /></button>
              </div>
              <div className="flex items-center gap-2 bg-white p-2 rounded-lg border border-gray-100">
                <span className="text-xs text-gray-500">Áp dụng trong:</span>
                <input type="number" className="w-16 border-b-2 text-center font-bold text-indigo-700 outline-none border-indigo-200" defaultValue={v.weeks} onBlur={(e) => handleSaveWeeks(v.name, parseInt(e.target.value) || 0)} />
                <span className="text-xs text-gray-500">tuần</span>
              </div>
            </div>
          )) : <p className="text-gray-400 text-sm italic">Chưa có dữ liệu phiên bản TKB.</p>}
        </div>
      </div>

      {/* 4. XUẤT BÁO CÁO TỔNG HỢP */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-emerald-200">
        <h3 className="text-xl font-bold text-emerald-800 flex items-center mb-6"><BarChart3 className="mr-2 text-emerald-600" /> Báo cáo Tổng hợp khuyết tật toàn trường</h3>
        <button onClick={exportIntegratedReport} disabled={selectedKTLops.length === 0 || versions.every(v => v.weeks === 0)}
          className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-300 text-white py-4 rounded-xl font-bold shadow-lg text-lg transition-all">
          <FileSpreadsheet className="inline mr-2 h-6 w-6" /> XUẤT BÁO CÁO EXCEL TỔNG HỢP
        </button>
      </div>
    </div>
  );
};

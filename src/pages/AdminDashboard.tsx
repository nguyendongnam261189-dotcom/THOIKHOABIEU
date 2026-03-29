import React, { useState, useEffect, useMemo } from 'react';
import { parseExcelFile } from '../services/excelParser';
import { scheduleService } from '../services/scheduleService';
import { teacherService } from '../services/teacherService';
import { Upload, FileSpreadsheet, CheckCircle, AlertCircle, Loader2, Trash2, Tag, Edit2, Check, X, Save, BarChart3, Users, ArrowRight, Filter, BookOpen } from 'lucide-react';
import { Schedule, Teacher } from '../types';
import * as XLSX from 'xlsx';

const DEPARTMENTS = ['Toán - Tin', 'Văn - GDCD', 'Sử - Địa', 'KHTN và Công nghệ', 'Ngoại ngữ', 'Nghệ thuật - Thể chất', 'Chung'];

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

  // =====================================================================
  // STATE CHO TÍNH NĂNG MAPPING 3 CỘT (KHI UPLOAD)
  // =====================================================================
  const [showMappingModal, setShowMappingModal] = useState(false);
  const [parseData, setParseData] = useState<any>(null);
  const [teacherMapping, setTeacherMapping] = useState<Record<string, string>>({});
  const [departmentMapping, setDepartmentMapping] = useState<Record<string, string>>({});
  const [filterDepartment, setFilterDepartment] = useState<string>(''); 

  // =====================================================================
  // 🔥 STATE CHO TÍNH NĂNG QUẢN LÝ TỪ ĐIỂN (DOMINO)
  // =====================================================================
  const [showDictionaryModal, setShowDictionaryModal] = useState(false);
  const [dictionaryAliases, setDictionaryAliases] = useState<Record<string, string>>({});
  const [editingDictionary, setEditingDictionary] = useState<Record<string, string>>({});
  
  // Dùng chính danh sách PCGD hiện tại làm từ điển quy chiếu (Nếu có TKB)
  const availablePcgdNames = useMemo(() => {
      // Vì danh sách gốc trong db.teachers chỉ chứa những người "đã từng được map"
      // nên chúng ta sẽ ưu tiên lấy từ teachers hiện có
      return Array.from(new Set(teachers.map(t => t.name))).filter(n => n !== 'Chưa rõ').sort();
  }, [teachers]);

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

  const garbageCollectTeachers = async () => {
    try {
      const currentSchedules = await scheduleService.getAllSchedules();
      const activeNames = new Set(currentSchedules.map(s => s.giao_vien));
      const currentTeachers = await teacherService.getAllTeachers();
      const deletePromises: Promise<void>[] = [];
      for (const t of currentTeachers) {
        if (!activeNames.has(t.name) && t.id) {
          if (typeof (teacherService as any).deleteTeacher === 'function') {
            deletePromises.push((teacherService as any).deleteTeacher(t.id));
          }
        }
      }
      if (deletePromises.length > 0) await Promise.all(deletePromises);
    } catch (error) { console.error("Lỗi dọn rác GV:", error); }
  };

  // =====================================================================
  // BƯỚC 1: XỬ LÝ UPLOAD EXCEL VÀ MỞ BẢNG MAPPING
  // =====================================================================
  const handleProcessExcel = async () => {
    if (!file || !versionName.trim()) {
      setStatus({ type: 'error', message: 'Vui lòng chọn file và nhập tên phiên bản.' });
      return;
    }
    setLoading(true);
    try {
      const data = await parseExcelFile(file);
      setParseData(data);

      let dbAliases: Record<string, string> = {};
      if (typeof (teacherService as any).getTeacherAliases === 'function') {
        dbAliases = await (teacherService as any).getTeacherAliases();
      }

      const initMapping: Record<string, string> = {};
      const initDept: Record<string, string> = {};

      data.tkbTeachers.forEach((t: any) => {
        if (t.originalName === 'Chưa rõ') return;
        if (dbAliases[t.originalName]) initMapping[t.originalName] = dbAliases[t.originalName];
        else if (data.suggestedMapping[t.originalName]) initMapping[t.originalName] = data.suggestedMapping[t.originalName];
        else initMapping[t.originalName] = '';
        initDept[t.originalName] = t.inferredGroup || 'Chung';
      });

      setTeacherMapping(initMapping);
      setDepartmentMapping(initDept);
      setFilterDepartment(''); 
      setShowMappingModal(true); 
    } catch (error: any) {
      setStatus({ type: 'error', message: `Lỗi đọc file Excel.` });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!showMappingModal || !parseData) return;
    const tkbNames = parseData.tkbTeachers.map((t: any) => t.originalName).filter((n: string) => n !== 'Chưa rõ');
    const pcgdNames = parseData.pcgdTeachers.map((p: any) => p.uniqueName);
    const unmappedTkb = tkbNames.filter((name: string) => !teacherMapping[name]);
    const usedPcgd = Object.values(teacherMapping).filter(Boolean);
    const unusedPcgd = pcgdNames.filter((p: string) => !usedPcgd.includes(p));
    if (unmappedTkb.length === 1 && unusedPcgd.length === 1) {
        setTeacherMapping(prev => ({ ...prev, [unmappedTkb[0]]: unusedPcgd[0] }));
    }
  }, [teacherMapping, showMappingModal, parseData]);

  const handleConfirmMapping = async () => {
    setLoading(true);
    try {
      const finalSchedules = parseData.rawSchedules.map((s: any) => ({
          ...s,
          giao_vien: teacherMapping[s.giao_vien] || s.giao_vien, 
          versionName: versionName.trim()
      }));

      const mergedTeachersMap = new Map<string, any>();
      parseData.pcgdTeachers.forEach((pcgd: any) => {
          const tkbOriginalName = Object.keys(teacherMapping).find(k => teacherMapping[k] === pcgd.uniqueName);
          const uiGroup = tkbOriginalName ? departmentMapping[tkbOriginalName] : 'Chung';
          mergedTeachersMap.set(pcgd.uniqueName, { name: pcgd.uniqueName, group: uiGroup && uiGroup !== 'Chung' ? uiGroup : 'Chung', subjectCounts: new Map<string, number>() });
      });

      parseData.tkbTeachers.forEach((tkb: any) => {
          const finalName = teacherMapping[tkb.originalName] || tkb.originalName;
          if (finalName === 'Chưa rõ') return;
          if (!mergedTeachersMap.has(finalName)) mergedTeachersMap.set(finalName, { name: finalName, group: departmentMapping[tkb.originalName] || 'Chung', subjectCounts: new Map() });
          const tData = mergedTeachersMap.get(finalName)!;
          tkb.subjectCounts.forEach((count: number, mon: string) => { tData.subjectCounts.set(mon, (tData.subjectCounts.get(mon) || 0) + count); });
      });

      const finalTeachers: Teacher[] = Array.from(mergedTeachersMap.values()).map(t => {
          const sortedSubjects = Array.from((t.subjectCounts as Map<string, number>).entries()).sort((a, b) => b[1] - a[1]).map(entry => entry[0]);
          return { id: '', name: t.name, subject: sortedSubjects.join(', '), group: t.group } as Teacher;
      });

      await scheduleService.saveSchedules(finalSchedules); 
      await teacherService.saveTeachers(finalTeachers);
      
      const validAliases: Record<string, string> = {};
      Object.entries(teacherMapping).forEach(([short, full]) => { if (short && full && short !== full && full !== 'Chưa rõ') validAliases[short] = full; });
      if (Object.keys(validAliases).length > 0 && typeof (teacherService as any).saveTeacherAliases === 'function') { 
        await (teacherService as any).saveTeacherAliases(validAliases); 
      }
      
      await garbageCollectTeachers();
      setStatus({ type: 'success', message: `Đã cập nhật TKB thành công!` });
      setVersionName(''); setFile(null); setShowMappingModal(false); loadData();
    } catch (error) { setStatus({ type: 'error', message: `Lỗi khi lưu dữ liệu TKB.` }); } finally { setLoading(false); }
  };

  // =====================================================================
  // 🔥 TÍNH NĂNG MỚI: MỞ BẢNG QUẢN LÝ TỪ ĐIỂN
  // =====================================================================
  const handleOpenDictionary = async () => {
    setLoading(true);
    try {
        if (typeof (teacherService as any).getTeacherAliases === 'function') {
            const dbAliases = await (teacherService as any).getTeacherAliases();
            setDictionaryAliases(dbAliases);
            setEditingDictionary(dbAliases);
            setShowDictionaryModal(true);
        } else {
            alert("Tính năng chưa được cập nhật trong teacherService.");
        }
    } catch (err) {
        setStatus({ type: 'error', message: 'Lỗi tải Từ điển.' });
    } finally {
        setLoading(false);
    }
  };

  // 🔥 THUẬT TOÁN BÁO ĐỎ VÒNG HOÁN VỊ (DOMINO)
  const getDominoConflicts = () => {
      const conflicts = new Set<string>();
      const fullNames = Object.values(editingDictionary).filter(Boolean);
      
      // Nếu 1 tên FullName xuất hiện 2 lần -> Xung đột!
      const counts: Record<string, number> = {};
      fullNames.forEach(name => { counts[name] = (counts[name] || 0) + 1; });
      
      Object.entries(editingDictionary).forEach(([short, full]) => {
          if (!full) conflicts.add(short); // Cảnh báo Đỏ nếu để trống
          if (full && counts[full] > 1) conflicts.add(short); // Cảnh báo Đỏ nếu trùng người khác
      });
      return conflicts;
  };

  const conflicts = useMemo(() => getDominoConflicts(), [editingDictionary]);

  // 🔥 LƯU TỪ ĐIỂN VÀ CẬP NHẬT TRÚNG ĐÍCH LỊCH DẠY CŨ
  const handleSaveDictionary = async () => {
      if (conflicts.size > 0) return; // Khóa an toàn, không cho lưu nếu còn lỗi đỏ
      setLoading(true);
      try {
          const changedAliases: { short: string, oldFull: string, newFull: string }[] = [];
          
          Object.entries(editingDictionary).forEach(([shortName, newFullName]) => {
              const oldFullName = dictionaryAliases[shortName];
              if (newFullName && newFullName !== oldFullName) {
                  changedAliases.push({ short: shortName, oldFull: oldFullName || shortName, newFull: newFullName });
              }
          });

          if (changedAliases.length > 0) {
              // 1. Cập nhật lại Từ điển
              await (teacherService as any).saveTeacherAliases(editingDictionary);
              
              // 2. Chạy hàm Cập nhật Trúng đích trong TKB
              if (typeof (scheduleService as any).updateTeacherInSchedules === 'function') {
                  for (const change of changedAliases) {
                      await (scheduleService as any).updateTeacherInSchedules(change.oldFull, change.newFull);
                  }
              }

              // 3. Dọn Rác (Xóa hồ sơ cũ nếu bị mồ côi)
              await garbageCollectTeachers();
              await loadData();
          }

          setShowDictionaryModal(false);
          setStatus({ type: 'success', message: `Đã cập nhật Từ điển và sửa lỗi Lịch dạy cũ thành công!` });
      } catch (error) {
          setStatus({ type: 'error', message: `Lỗi khi lưu Từ điển.` });
      } finally {
          setLoading(false);
      }
  };

  const handleDeleteAlias = async (shortName: string) => {
    if (!window.confirm(`Xóa bí danh "${shortName}"? Việc này không làm thay đổi lịch dạy hiện tại.`)) return;
    try {
        await (teacherService as any).deleteTeacherAlias(shortName);
        const newDict = { ...editingDictionary };
        delete newDict[shortName];
        setEditingDictionary(newDict);
        setDictionaryAliases(newDict);
    } catch (e) { alert("Lỗi xóa bí danh"); }
  };


  const handleSaveWeeks = async (vName: string, weeks: number) => {
    try { await scheduleService.saveVersionWeeks(vName, weeks); loadData(); } catch (error) { alert("Lỗi lưu số tuần."); }
  };

  const handleRenameVersion = async (oldName: string, newName: string) => {
    setLoading(true); try { await scheduleService.renameVersion(oldName, newName.trim()); setEditingVersion(null); loadData(); } finally { setLoading(false); }
  };

  const handleDeleteVersion = async (vName: string) => {
    if (!window.confirm(`Xóa "${vName}"?`)) return;
    setLoading(true); try { await scheduleService.deleteScheduleByVersion(vName); await garbageCollectTeachers(); loadData(); } finally { setLoading(false); }
  };

  const handleDeleteAll = async () => {
    setLoading(true);
    try {
      await scheduleService.deleteAllSchedules();
      const allT = await teacherService.getAllTeachers();
      if (typeof (teacherService as any).deleteTeacher === 'function') { await Promise.all(allT.map(t => (teacherService as any).deleteTeacher(t.id))); }
      await loadData();
    } finally { setLoading(false); setShowDeleteConfirm(false); }
  };

  const isHDTNType = (subject: string): boolean => {
    const s = (subject || '').toUpperCase();
    return s.includes('HDTN') || s.includes('HĐTN') || s.includes('CHÀO CỜ') || s.includes('CC-') || s.includes('SHL') || s.includes('SINH HOẠT');
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
        const rows: any[] = []; let deptTotal = 0;
        deptTeachers.forEach((teacher) => {
          let teacherTotalKT = 0; let detailsArr: string[] = []; let classesTaughtSet = new Set<string>();
          versions.forEach(v => {
            if (v.weeks <= 0) return;
            const vPeriods = allSchedules.filter(s => s.versionName === v.name && s.giao_vien === teacher.name && s.lop.split(', ').some(l => ktLopSet.has(l.trim())));
            if (vPeriods.length === 0) return;
            const classesAsCN = new Set<string>();
            vPeriods.forEach(p => { if (isHDTNType(p.mon)) p.lop.split(', ').map(l => l.trim()).filter(l => ktLopSet.has(l)).forEach(ml => classesAsCN.add(ml)); });
            const normalPeriods = vPeriods.filter(p => !isHDTNType(p.mon));
            const classCountMap: Record<string, number> = {}; let subTotalVersion = 0;
            normalPeriods.forEach(p => { p.lop.split(', ').map(l => l.trim()).filter(l => ktLopSet.has(l)).forEach(ml => { const cleanLop = ml.replace(/\./g, '/'); classCountMap[cleanLop] = (classCountMap[cleanLop] || 0) + 1; classesTaughtSet.add(cleanLop); subTotalVersion += 1; }); });
            classesAsCN.forEach(ml => { const cleanLop = ml.replace(/\./g, '/'); const key = `HĐTN (CN) lớp ${cleanLop}`; classCountMap[key] = 3; classesTaughtSet.add(cleanLop); subTotalVersion += 3; });
            if (subTotalVersion > 0) { teacherTotalKT += (subTotalVersion * v.weeks); detailsArr.push(`[${Object.entries(classCountMap).map(([l, c]) => `${c}t ${l}`).join(' + ')}] x ${v.weeks} tuần`); }
          });
          if (teacherTotalKT > 0) { rows.push({ 'STT': rows.length + 1, 'Họ và tên': teacher.name, 'Lớp dạy': Array.from(classesTaughtSet).join(', '), 'Số tiết': teacherTotalKT, 'Công thức tính': detailsArr.join(' + ') + ` = ${teacherTotalKT} tiết` }); deptTotal += teacherTotalKT; }
        });
        if (rows.length > 0) { summaryData.push({ 'STT': summaryData.length + 1, 'Tổ chuyên môn': dept, 'Tổng số tiết': deptTotal }); grandTotal += deptTotal; rows.push({ 'STT': '', 'Họ và tên': 'TỔNG CỘNG TỔ', 'Lớp dạy': '', 'Số tiết': deptTotal, 'Công thức tính': '' }); const ws = XLSX.utils.json_to_sheet([]); XLSX.utils.sheet_add_aoa(ws, [[`BÁO CÁO TIẾT DẠY LỚP KHUYẾT TẬT - TỔ: ${dept.toUpperCase()}`]], { origin: 'A1' }); XLSX.utils.sheet_add_json(ws, rows, { origin: 'A3' }); ws['!cols'] = [{ wch: 5 }, { wch: 25 }, { wch: 20 }, { wch: 10 }, { wch: 80 }]; XLSX.utils.book_append_sheet(wb, ws, `Tổ ${dept.substring(0, 20)}`); }
      });
      const summaryRows = [['BÁO CÁO TỔNG HỢP TIẾT DẠY LỚP KHUYẾT TẬT'], [`Ngày xuất: ${new Date().toLocaleDateString('vi-VN')}`], [], ['STT', 'Tổ chuyên môn', 'Tổng số tiết']];
      summaryData.forEach(item => summaryRows.push([item.STT, item['Tổ chuyên môn'], item['Tổng số tiết']]));
      summaryRows.push(['', 'TỔNG CỘNG TOÀN TRƯỜNG', grandTotal]); const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows); wsSummary['!cols'] = [{ wch: 5 }, { wch: 40 }, { wch: 20 }]; const finalWb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(finalWb, wsSummary, 'TỔNG HỢP TOÀN TRƯỜNG'); wb.SheetNames.forEach(name => XLSX.utils.book_append_sheet(finalWb, wb.Sheets[name], name)); XLSX.writeFile(finalWb, `Bao_Cao_Che_Do_Khuyet_Tat_Vinh_Vien.xlsx`);
    } catch (err) { alert("Lỗi xuất file."); }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-10 px-4 relative">
      
      {/* ================================================================= */}
      {/* 🔥 MODAL 2: QUẢN LÝ TỪ ĐIỂN VÀ CHỐNG DOMINO */}
      {/* ================================================================= */}
      {showDictionaryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/60 backdrop-blur-sm overflow-y-auto py-10">
          <div className="bg-white w-full max-w-4xl rounded-2xl shadow-2xl flex flex-col max-h-full border border-indigo-100">
            <div className="p-6 border-b flex justify-between items-center bg-indigo-50 rounded-t-2xl">
              <div>
                <h2 className="text-2xl font-bold text-indigo-900 flex items-center"><BookOpen className="mr-3" /> Quản lý Từ điển Tên Giáo viên</h2>
                <p className="text-indigo-700 text-sm mt-1">
                  Chỉnh sửa tên viết tắt bị sai. <strong className="text-red-500">Việc lưu thay đổi sẽ sửa thẳng vào TKB cũ.</strong>
                </p>
              </div>
              <button onClick={() => setShowDictionaryModal(false)} className="text-gray-500 hover:text-red-500"><X className="w-6 h-6" /></button>
            </div>

            <div className="p-6 flex-1 overflow-y-auto bg-gray-50">
              {Object.keys(editingDictionary).length === 0 ? (
                  <p className="text-center text-gray-500 py-10 italic">Từ điển đang trống. Hãy tải TKB lên để máy tính tự học!</p>
              ) : (
                  <div className="space-y-3">
                      <div className="grid grid-cols-12 gap-4 font-bold text-gray-500 text-xs px-3 pb-2 uppercase tracking-wider">
                          <div className="col-span-4">Bí danh (Từ TKB)</div>
                          <div className="col-span-1 text-center"></div>
                          <div className="col-span-6">Tên Đầy đủ (Chuẩn PCGD)</div>
                          <div className="col-span-1 text-center">Xóa</div>
                      </div>

                      {/* Sắp xếp: Ưu tiên dòng bị LỖI ĐỎ (Domino) lên trên cùng */}
                      {Object.keys(editingDictionary)
                          .sort((a, b) => (conflicts.has(b) ? 1 : 0) - (conflicts.has(a) ? 1 : 0))
                          .map((shortName) => {
                          const isConflict = conflicts.has(shortName);
                          // Lọc Options: Chỉ lấy những người đang chưa có chủ (để gợi ý sửa lỗi Domino)
                          const usedOthers = Object.values(editingDictionary).filter(v => v && v !== editingDictionary[shortName]);
                          const availableOptions = availablePcgdNames.filter(name => !usedOthers.includes(name));

                          return (
                              <div key={shortName} className={`grid grid-cols-12 gap-4 items-center p-4 rounded-xl border transition-all ${isConflict ? 'bg-red-50 border-red-300 shadow-sm' : 'bg-white border-gray-200 hover:border-indigo-300'}`}>
                                  <div className="col-span-4 font-bold text-gray-800">
                                      {shortName}
                                  </div>
                                  <div className="col-span-1 text-center">
                                      <ArrowRight className={`inline w-5 h-5 ${isConflict ? 'text-red-500' : 'text-green-500'}`} />
                                  </div>
                                  <div className="col-span-6">
                                      <select 
                                        className={`w-full p-2.5 rounded-lg text-sm font-bold outline-none transition-all ${isConflict ? 'border-2 border-red-500 bg-red-100 text-red-900' : 'border border-gray-300 bg-gray-50 text-indigo-900 focus:border-indigo-500 focus:bg-white'}`}
                                        value={editingDictionary[shortName] || ''}
                                        onChange={(e) => {
                                            const newVal = e.target.value;
                                            setEditingDictionary(prev => ({ ...prev, [shortName]: newVal }));
                                        }}
                                      >
                                          <option value="">-- CHỌN LẠI TÊN (ĐANG BỊ TRÙNG) --</option>
                                          {/* Hiển thị Option trống + Option chính chủ hiện tại */}
                                          {availableOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                          {editingDictionary[shortName] && !availableOptions.includes(editingDictionary[shortName]) && (
                                              <option value={editingDictionary[shortName]}>{editingDictionary[shortName]}</option>
                                          )}
                                      </select>
                                      {isConflict && <p className="text-red-600 text-xs mt-1.5 font-medium flex items-center"><AlertCircle className="w-3 h-3 mr-1"/> Tên này đang bị trùng lặp hoặc để trống!</p>}
                                  </div>
                                  <div className="col-span-1 text-center">
                                      <button onClick={() => handleDeleteAlias(shortName)} className="text-gray-400 hover:text-red-500 transition-colors p-2 hover:bg-red-50 rounded-lg">
                                          <Trash2 className="w-5 h-5" />
                                      </button>
                                  </div>
                              </div>
                          );
                      })}
                  </div>
              )}
            </div>

            <div className="p-5 border-t bg-white rounded-b-2xl flex justify-between items-center shadow-inner">
              <div className="text-sm font-medium text-gray-500">
                Tổng: {Object.keys(editingDictionary).length} bí danh đã học.
              </div>
              <div className="flex gap-3">
                <button onClick={() => setShowDictionaryModal(false)} className="px-6 py-2.5 rounded-lg border border-gray-300 font-bold text-gray-600 bg-white hover:bg-gray-100">Đóng</button>
                <button 
                  onClick={handleSaveDictionary} 
                  disabled={loading || conflicts.size > 0}
                  className={`px-6 py-2.5 rounded-lg font-bold text-white shadow flex items-center transition-all ${conflicts.size > 0 ? 'bg-gray-400 cursor-not-allowed' : 'bg-emerald-600 hover:bg-emerald-700'}`}
                >
                  {loading ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <Save className="w-5 h-5 mr-2" />}
                  {conflicts.size > 0 ? 'Vui lòng sửa lỗi đỏ' : 'Lưu Từ điển & Sửa Lịch cũ'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- MODAL MAPPING (HIỆN LÊN KHI ĐỌC XONG EXCEL) --- */}
      {showMappingModal && parseData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/60 backdrop-blur-sm overflow-y-auto py-10">
          <div className="bg-white w-full max-w-6xl rounded-2xl shadow-2xl flex flex-col max-h-full">
            <div className="p-6 border-b flex justify-between items-center bg-indigo-50 rounded-t-2xl">
              <div>
                <h2 className="text-2xl font-bold text-indigo-900 flex items-center"><Users className="mr-3" /> Đối soát Danh sách Giáo viên</h2>
                <p className="text-indigo-700 text-sm mt-1">Khớp nối Tên viết tắt (TKB) sang Tên đầy đủ (PCGD). Lọc theo Tổ để xử lý nhanh hơn.</p>
              </div>
              <button onClick={() => setShowMappingModal(false)} className="text-gray-500 hover:text-red-500"><X className="w-6 h-6" /></button>
            </div>
            
            <div className="p-6 flex-1 overflow-y-auto">
              
              <div className="flex flex-wrap gap-2 mb-6 p-3 bg-gray-50 rounded-xl border border-gray-100">
                <span className="text-sm font-bold text-gray-500 mr-2 flex items-center"><Filter className="w-4 h-4 mr-1" /> Lọc theo Tổ:</span>
                <button 
                  onClick={() => setFilterDepartment('')}
                  className={`px-3 py-1.5 text-xs font-bold rounded-full transition-all border ${!filterDepartment ? 'bg-indigo-600 text-white border-indigo-600 shadow' : 'bg-white text-gray-600 border-gray-200 hover:border-indigo-300 hover:text-indigo-700'}`}
                >
                  Tất cả ({parseData.tkbTeachers.filter((t: any) => t.originalName !== 'Chưa rõ').length})
                </button>
                {DEPARTMENTS.map(dept => {
                  const countInDept = parseData.tkbTeachers.filter((t: any) => t.originalName !== 'Chưa rõ' && departmentMapping[t.originalName] === dept).length;
                  if (countInDept === 0) return null;
                  return (
                    <button 
                      key={dept}
                      onClick={() => setFilterDepartment(dept)}
                      className={`px-3 py-1.5 text-xs font-bold rounded-full transition-all border ${filterDepartment === dept ? 'bg-indigo-600 text-white border-indigo-600 shadow' : 'bg-white text-gray-600 border-gray-200 hover:border-indigo-300 hover:text-indigo-700'}`}
                    >
                      {dept} ({countInDept})
                    </button>
                  );
                })}
              </div>

              <div className="grid grid-cols-12 gap-4 font-bold text-gray-600 bg-gray-100 p-3 rounded-t-lg text-sm border-b-2 border-gray-300">
                <div className="col-span-3">TÊN VIẾT TẮT (TRONG TKB)</div>
                <div className="col-span-1 text-center"></div>
                <div className="col-span-4">CHỌN TÊN ĐẦY ĐỦ (CHUẨN)</div>
                <div className="col-span-4">GÁN VÀO TỔ CHUYÊN MÔN</div>
              </div>
              
              {parseData.tkbTeachers
                .filter((t: any) => t.originalName !== 'Chưa rõ')
                .filter((t: any) => {
                  if (!filterDepartment) return true;
                  return departmentMapping[t.originalName] === filterDepartment;
                })
                .sort((a: any, b: any) => (teacherMapping[a.originalName] ? 1 : 0) - (teacherMapping[b.originalName] ? 1 : 0))
                .map((tkb: any, idx: number) => {
                  const isMapped = !!teacherMapping[tkb.originalName];
                  const usedOthers = Object.values(teacherMapping).filter(v => v && v !== teacherMapping[tkb.originalName]);
                  const availableOptions = parseData.pcgdTeachers.filter((p: any) => !usedOthers.includes(p.uniqueName));

                  return (
                    <div key={idx} className={`grid grid-cols-12 gap-4 items-center p-3 border-b border-gray-100 transition-colors ${isMapped ? 'hover:bg-green-50' : 'bg-red-50'}`}>
                      <div className="col-span-3 font-medium text-gray-800">
                        {tkb.originalName}
                        <div className="text-xs text-gray-400 mt-0.5">{Array.from(tkb.subjectCounts.keys()).join(', ')}</div>
                      </div>
                      <div className="col-span-1 text-center">
                        <ArrowRight className={`inline w-5 h-5 ${isMapped ? 'text-green-500' : 'text-red-400'}`} />
                      </div>
                      <div className="col-span-4">
                        <select 
                          className={`w-full p-2 border rounded-lg text-sm font-medium outline-none ${isMapped ? 'border-green-300 bg-green-50 text-green-800 focus:border-green-500' : 'border-red-300 bg-white text-red-700 focus:border-red-500 ring-2 ring-red-100'}`}
                          value={teacherMapping[tkb.originalName] || ''}
                          onChange={(e) => setTeacherMapping(prev => ({ ...prev, [tkb.originalName]: e.target.value }))}
                        >
                          <option value="">-- Cần xác định thủ công --</option>
                          {availableOptions.map((p: any) => <option key={p.uniqueName} value={p.uniqueName}>{p.uniqueName}</option>)}
                        </select>
                      </div>
                      <div className="col-span-4">
                        <select 
                          className="w-full p-2 border border-gray-200 rounded-lg text-sm text-gray-700 bg-white outline-none focus:border-indigo-500"
                          value={departmentMapping[tkb.originalName] || 'Chung'}
                          onChange={(e) => setDepartmentMapping(prev => ({ ...prev, [tkb.originalName]: e.target.value }))}
                        >
                          {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
                        </select>
                      </div>
                    </div>
                  );
              })}

              {filterDepartment && parseData.tkbTeachers.filter((t: any) => t.originalName !== 'Chưa rõ' && departmentMapping[t.originalName] === filterDepartment).length === 0 && (
                <div className="text-center py-10 text-gray-400 italic bg-gray-50 rounded-b-lg border border-gray-100">
                  Không có giáo viên nào thuộc tổ "{filterDepartment}" trong TKB này.
                </div>
              )}
            </div>

            <div className="p-4 border-t bg-gray-50 rounded-b-2xl flex justify-between items-center">
              <div className="text-sm font-bold text-gray-600 bg-white p-2.5 rounded-xl border border-gray-100 shadow-sm">
                <Users className="inline w-4 h-4 mr-1 text-indigo-500" /> Tổng trong TKB: {parseData.tkbTeachers.filter((t:any)=>t.originalName!=='Chưa rõ').length} GV
                <span className="mx-2 text-gray-300">|</span>
                <CheckCircle className="inline w-4 h-4 mr-1 text-green-500" /> Đã khớp: <span className="text-green-600 text-lg">{Object.values(teacherMapping).filter(Boolean).length}</span> GV
              </div>
              <div className="flex gap-3">
                <button onClick={() => setShowMappingModal(false)} className="px-6 py-2.5 rounded-lg border border-gray-300 font-bold text-gray-600 bg-white hover:bg-gray-100">Hủy bỏ</button>
                <button onClick={handleConfirmMapping} disabled={loading} className="px-6 py-2.5 rounded-lg font-bold text-white bg-indigo-600 hover:bg-indigo-700 shadow flex items-center disabled:bg-gray-400">
                  {loading ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <CheckCircle className="w-5 h-5 mr-2" />}
                  Lưu TKB & Ghi nhớ Từ điển
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 1. UPLOAD */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-gray-800 flex items-center"><Upload className="mr-2 text-indigo-600" /> Nhập dữ liệu TKB</h2>
          
          {/* 🔥 NÚT MỞ BẢNG QUẢN LÝ TỪ ĐIỂN */}
          <button 
            onClick={handleOpenDictionary}
            className="flex items-center px-4 py-2 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-lg text-sm font-bold transition-colors"
          >
            <BookOpen className="w-4 h-4 mr-2" /> Quản lý Từ điển Tên
          </button>
        </div>

        {status && (
          <div className={`p-4 mb-6 rounded-xl text-sm font-medium border ${status.type === 'success' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
            {status.type === 'success' ? <CheckCircle className="inline mr-2 w-5 h-5" /> : <AlertCircle className="inline mr-2 w-5 h-5" />}
            {status.message}
          </div>
        )}
        <div className="space-y-4 mb-6">
          <label className="block">
            <span className="text-sm font-bold text-gray-700 flex items-center mb-2"><Tag className="w-4 h-4 mr-2" /> Tên phiên bản:</span>
            <input type="text" placeholder="TKB Số..." className="w-full px-4 py-2 border border-gray-300 rounded-lg" value={versionName} onChange={(e) => setVersionName(e.target.value)} />
          </label>
          <div className="border-2 border-dashed border-gray-300 rounded-xl p-6 text-center hover:bg-gray-50 transition-colors">
            <FileSpreadsheet className="mx-auto h-10 w-10 text-gray-400 mb-3" />
            <input type="file" accept=".xlsx, .xls" onChange={handleFileChange} className="hidden" id="file-upload" />
            <label htmlFor="file-upload" className="cursor-pointer inline-flex items-center px-4 py-2 text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700">Chọn file Excel</label>
            {file && <p className="mt-3 text-sm text-indigo-600 font-medium italic">{file.name}</p>}
          </div>
        </div>
        <div className="flex justify-between items-center">
          <button onClick={handleProcessExcel} disabled={!file || !versionName || loading} className="bg-indigo-600 text-white px-6 py-2.5 rounded-lg font-bold shadow-md disabled:bg-gray-400">
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Tải lên & Khớp Dữ liệu'}
          </button>
          {!showDeleteConfirm ? ( <button onClick={() => setShowDeleteConfirm(true)} className="text-red-600 text-sm font-bold underline">Xóa sạch dữ liệu</button> ) : (
            <div className="flex items-center space-x-2 bg-red-50 p-2 rounded-lg border border-red-200">
              <button onClick={handleDeleteAll} disabled={loading} className="px-3 py-1.5 bg-red-600 text-white font-bold text-sm rounded-md shadow hover:bg-red-700">{loading ? 'Đang xóa...' : 'Xóa 100%'}</button>
              <button onClick={() => setShowDeleteConfirm(false)} className="px-3 py-1.5 bg-white text-gray-700 font-bold text-sm rounded-md border shadow-sm hover:bg-gray-50">Hủy</button>
            </div>
          )}
        </div>
      </div>

      {/* 2. QUẢN LÝ PHIÊN BẢN */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
        <h3 className="text-xl font-bold text-gray-800 mb-6 flex items-center"><Save className="mr-2 text-amber-500" /> Số tuần dạy thực tế</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {versions.map(v => (
            <div key={v.name} className="p-4 bg-gray-50 rounded-xl border border-gray-200 group">
              <div className="flex justify-between items-center mb-3">
                {editingVersion === v.name ? ( <div className="flex items-center gap-2 flex-1"><input autoFocus className="flex-1 px-2 py-1 border rounded text-sm font-bold" value={newVersionName} onChange={e => setNewVersionName(e.target.value)} /><button onClick={() => handleRenameVersion(v.name, newVersionName)}><Check className="w-4 h-4 text-green-600" /></button></div> ) : (
                  <div className="flex items-center"><span className="font-bold text-gray-700">{v.name}</span><button onClick={() => { setEditingVersion(v.name); setNewVersionName(v.name); }} className="ml-2 text-gray-400 opacity-0 group-hover:opacity-100"><Edit2 className="w-3 h-3" /></button></div>
                )}
                <button onClick={() => handleDeleteVersion(v.name)} className="text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"><Trash2 className="w-4 h-4 hover:text-red-600" /></button>
              </div>
              <div className="flex items-center gap-2 bg-white p-2 rounded-lg border border-gray-100 shadow-sm">
                <span className="text-xs text-gray-500 font-medium">Dạy:</span>
                <input type="number" className="w-16 border-b-2 border-indigo-200 text-center font-bold text-indigo-700 outline-none focus:border-indigo-600" defaultValue={v.weeks} onBlur={(e) => handleSaveWeeks(v.name, parseInt(e.target.value) || 0)} />
                <span className="text-xs text-gray-500 font-medium">tuần</span>
              </div>
            </div>
          ))}
          {versions.length === 0 && <p className="text-gray-400 italic text-sm col-span-2">Chưa có phiên bản TKB nào.</p>}
        </div>
      </div>

      {/* 3. XUẤT BÁO CÁO */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-emerald-200">
        <h3 className="text-xl font-bold text-emerald-800 flex items-center mb-6"><BarChart3 className="mr-2 text-emerald-600" /> Báo cáo Chế độ Khuyết tật</h3>
        <div className="flex flex-wrap gap-2 mb-8 max-h-48 overflow-y-auto p-4 bg-gray-50 rounded-xl border border-gray-100">
          {allClassNames.map(lop => (
            <button key={lop} onClick={() => setSelectedKTLops(prev => prev.includes(lop) ? prev.filter(l => l !== lop) : [...prev, lop])}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${selectedKTLops.includes(lop) ? 'bg-emerald-600 text-white border-emerald-600 shadow-md transform scale-105' : 'bg-white text-gray-600 border-gray-200 hover:border-emerald-400 hover:text-emerald-700'}`}>
              {lop.replace(/\./g, '/')}
            </button>
          ))}
          {allClassNames.length === 0 && <p className="text-gray-400 italic text-sm">Vui lòng tải TKB lên để hiển thị danh sách lớp.</p>}
        </div>
        <button onClick={exportIntegratedReport} disabled={selectedKTLops.length === 0 || versions.every(v => v.weeks === 0)} className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-300 text-white py-4 rounded-xl font-bold shadow-lg text-lg transition-colors">
          <FileSpreadsheet className="inline mr-2 h-6 w-6" /> TẢI FILE BÁO CÁO CỐ ĐỊNH (TỰ NHẬN DIỆN GVCN)
        </button>
      </div>
    </div>
  );
};

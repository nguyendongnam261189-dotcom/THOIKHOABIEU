import React, { useState, useEffect } from 'react';
import { FileSpreadsheet, Settings, Users, Plus, Trash2, Download, Calendar, PenTool, Loader2 } from 'lucide-react';
import { Schedule } from '../types';
import { scheduleService } from '../services/scheduleService';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';

interface DisabledStudent {
  id: string;
  className: string;
  studentName: string;
}

export const DisabilityReport: React.FC = () => {
  // =====================================================================
  // 1. STATE QUẢN LÝ DỮ LIỆU TKB
  // =====================================================================
  const [allSchedules, setAllSchedules] = useState<Schedule[]>([]);
  const [versions, setVersions] = useState<{ name: string, weeks: number }[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    const loadData = async () => {
      setLoadingData(true);
      try {
        const [schedules, configs] = await Promise.all([
          scheduleService.getAllSchedules(),
          scheduleService.getVersionConfigs()
        ]);
        setAllSchedules(schedules);
        
        const names = Array.from(new Set(schedules.map(s => s.versionName || 'Mặc định'))).sort();
        const vs = names.map(n => {
          const cfg = configs.find(c => c.versionName === n);
          return { name: n, weeks: cfg?.appliedWeeks || 0 };
        });
        setVersions(vs);
      } catch (error) {
        console.error("Lỗi tải dữ liệu TKB:", error);
      } finally {
        setLoadingData(false);
      }
    };
    loadData();
  }, []);

  const allClassNames = Array.from(new Set(allSchedules.map(s => s.lop?.split(',')[0].trim()))).filter(Boolean).sort();

  // =====================================================================
  // 2. STATE CẤU HÌNH BÁO CÁO (LINH HOẠT THEO MẪU 1)
  // =====================================================================
  const [config, setConfig] = useState({
    semester: 'II',
    schoolYear: '2025-2026',
    startMonth: 1,
    endMonth: 5,
    exportDate: 'tháng 5 năm 2026',
    principal: '',
    vicePrincipal: '',
    ttcm: ''
  });

  const [students, setStudents] = useState<DisabledStudent[]>([]);
  const [newClass, setNewClass] = useState('');
  const [newName, setNewName] = useState('');

  const handleAddStudent = () => {
    if (!newClass.trim() || !newName.trim()) {
      alert("Vui lòng nhập đủ Tên lớp và Họ tên học sinh!");
      return;
    }
    setStudents([...students, { id: Date.now().toString(), className: newClass.trim(), studentName: newName.trim() }]);
    setNewClass('');
    setNewName('');
  };

  const handleRemoveStudent = (id: string) => {
    setStudents(students.filter(s => s.id !== id));
  };

  const isHDTNType = (subject: string): boolean => {
    const s = (subject || '').toUpperCase();
    return s.includes('HDTN') || s.includes('HĐTN') || s.includes('CHÀO CỜ') || s.includes('CC-') || s.includes('SHL') || s.includes('SINH HOẠT');
  };

  // =====================================================================
  // 3. THUẬT TOÁN XUẤT EXCEL MẪU 1 (CO GIÃN CỘT THÔNG MINH)
  // =====================================================================
  const handleExportExcel = async () => {
    if (students.length === 0) {
      alert("Vui lòng thêm ít nhất 1 học sinh khuyết tật!");
      return;
    }
    setIsExporting(true);

    try {
      const wb = new ExcelJS.Workbook();
      wb.creator = 'TKB Manager';
      
      // Tính toán mảng các tháng cần hiển thị
      const months: number[] = [];
      if (config.startMonth <= config.endMonth) {
        for (let i = config.startMonth; i <= config.endMonth; i++) months.push(i);
      } else {
        for (let i = config.startMonth; i <= 12; i++) months.push(i);
        for (let i = 1; i <= config.endMonth; i++) months.push(i);
      }

      const M = months.length; // Số lượng cột tháng
      const TOTAL_COLS = 4 + M + 2; // (STT, Lớp, Tên, Môn) + (Tháng...) + (Tổng, Ghi chú)

      // Gom dữ liệu theo từng Giáo viên
      const tMap = new Map<string, { subjects: Set<string>, records: any[], totalPeriods: number }>();

      students.forEach(student => {
        const classSchedules = allSchedules.filter(s => s.lop.split(',').map(c => c.trim()).includes(student.className));
        
        const tsMap = new Map<string, { teacher: string, subject: string }>();
        classSchedules.forEach(s => {
          if (s.giao_vien === 'Chưa rõ') return;
          const subject = isHDTNType(s.mon) ? 'HĐTN' : s.mon;
          const key = `${s.giao_vien}|${subject}`;
          if (!tsMap.has(key)) tsMap.set(key, { teacher: s.giao_vien, subject });
        });

        tsMap.forEach(combo => {
          const parts: { p: number, w: number }[] = [];
          let totalW = 0;
          let totalP = 0;

          versions.forEach(v => {
            if (v.weeks <= 0) return;
            let count = 0;
            const vSchedules = classSchedules.filter(s => s.versionName === v.name && s.giao_vien === combo.teacher);
            
            if (combo.subject === 'HĐTN') {
              count = vSchedules.some(s => isHDTNType(s.mon)) ? 3 : 0; // Giữ nguyên thuật toán 3 tiết HĐTN
            } else {
              count = vSchedules.filter(s => !isHDTNType(s.mon) && s.mon === combo.subject).length;
            }

            if (count > 0) {
              parts.push({ p: count, w: v.weeks });
              totalW += v.weeks;
              totalP += count * v.weeks;
            }
          });

          if (totalP > 0) {
            if (!tMap.has(combo.teacher)) tMap.set(combo.teacher, { subjects: new Set(), records: [], totalPeriods: 0 });
            const tData = tMap.get(combo.teacher)!;
            tData.subjects.add(combo.subject);
            tData.totalPeriods += totalP;

            const isConstant = parts.every(pt => pt.p === parts[0].p);
            const formula = isConstant ? `${parts[0].p}t/tuần x ${totalW} tuần` : parts.map(pt => `${pt.p}t x ${pt.w} tuần`).join(' + ');

            tData.records.push({
              className: student.className,
              studentName: student.studentName,
              subject: combo.subject,
              totalP,
              formula
            });
          }
        });
      });

      if (tMap.size === 0) {
        alert("Không tìm thấy dữ liệu tiết dạy nào khớp với danh sách học sinh trên hệ thống TKB!");
        setIsExporting(false);
        return;
      }

      // VẼ EXCEL CHO TỪNG GIÁO VIÊN
      tMap.forEach((tData, teacherName) => {
        const safeName = teacherName.substring(0, 31).replace(/[\\/?*\[\]]/g, '');
        const ws = wb.addWorksheet(safeName);

        // Cài đặt trang A4 in ngang (Mẫu bảng nhiều cột nên in ngang Landscape cho đẹp)
        ws.pageSetup = {
          paperSize: 9, 
          orientation: 'landscape',
          fitToPage: true,
          fitToWidth: 1,
          fitToHeight: 0,
          margins: { left: 0.3, right: 0.3, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 }
        };

        // Hàm tiện ích lấy tên cột Excel (VD: 1->A, 2->B...)
        const getColLetter = (colIndex: number) => {
          let temp = colIndex;
          let letter = '';
          while (temp > 0) {
            let modulo = (temp - 1) % 26;
            letter = String.fromCharCode(65 + modulo) + letter;
            temp = Math.floor((temp - modulo) / 26);
          }
          return letter;
        };

        const END_COL = getColLetter(TOTAL_COLS);
        const MONTH_END_COL = getColLetter(4 + M);

        // Cài đặt độ rộng cột
        ws.getColumn(1).width = 6;  // STT
        ws.getColumn(2).width = 12; // Lớp
        ws.getColumn(3).width = 25; // Tên HS
        ws.getColumn(4).width = 15; // Môn
        for(let i = 1; i <= M; i++) ws.getColumn(4 + i).width = 10; // Các tháng
        ws.getColumn(TOTAL_COLS - 1).width = 15; // Cột Tổng
        ws.getColumn(TOTAL_COLS).width = 20;     // Cột Ghi chú

        let r = 1;
        // Header Trái
        ws.mergeCells(`A${r}:C${r}`);
        ws.getCell(`A${r}`).value = 'UBND PHƯỜNG HÒA KHÁNH';
        ws.getCell(`A${r}`).alignment = { horizontal: 'center' };
        
        // Header Phải
        ws.mergeCells(`D${r}:${getColLetter(TOTAL_COLS - 1)}${r}`);
        ws.getCell(`D${r}`).value = 'CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM';
        ws.getCell(`D${r}`).font = { bold: true, name: 'Times New Roman', size: 12 };
        ws.getCell(`D${r}`).alignment = { horizontal: 'center' };
        
        ws.getCell(`${END_COL}${r}`).value = 'Mẫu 1';
        ws.getCell(`${END_COL}${r}`).font = { bold: true, name: 'Times New Roman', size: 12 };
        r++;

        ws.mergeCells(`A${r}:C${r}`);
        ws.getCell(`A${r}`).value = 'TRƯỜNG TRUNG HỌC CƠ SỞ';
        ws.getCell(`A${r}`).alignment = { horizontal: 'center' };
        ws.mergeCells(`D${r}:${getColLetter(TOTAL_COLS - 1)}${r}`);
        ws.getCell(`D${r}`).value = 'Độc lập - Tự do - Hạnh phúc';
        ws.getCell(`D${r}`).font = { bold: true, underline: true, name: 'Times New Roman', size: 12 };
        ws.getCell(`D${r}`).alignment = { horizontal: 'center' };
        r++;

        ws.mergeCells(`A${r}:C${r}`);
        ws.getCell(`A${r}`).value = 'NGUYỄN BỈNH KHIÊM';
        ws.getCell(`A${r}`).font = { bold: true, name: 'Times New Roman', size: 12 };
        ws.getCell(`A${r}`).alignment = { horizontal: 'center' };
        r += 2;

        // Tiêu đề báo cáo
        ws.mergeCells(`A${r}:${END_COL}${r}`);
        ws.getCell(`A${r}`).value = 'BẢNG KÊ KHAI SỐ GIỜ DẠY (TIẾT DẠY) Ở LỚP CÓ NGƯỜI KHUYẾT TẬT';
        ws.getCell(`A${r}`).font = { bold: true, name: 'Times New Roman', size: 14 };
        ws.getCell(`A${r}`).alignment = { horizontal: 'center' };
        r++;

        ws.mergeCells(`A${r}:${END_COL}${r}`);
        ws.getCell(`A${r}`).value = `HỌC KỲ ${config.semester.toUpperCase()} NĂM HỌC ${config.schoolYear} (TỪ THÁNG ${String(config.startMonth).padStart(2,'0')} ĐẾN THÁNG ${String(config.endMonth).padStart(2,'0')} NĂM ${config.exportDate.split('năm')[1]?.trim() || ''})`;
        ws.getCell(`A${r}`).font = { bold: true, name: 'Times New Roman', size: 12 };
        ws.getCell(`A${r}`).alignment = { horizontal: 'center' };
        r += 2;

        // Thông tin Giáo viên
        ws.mergeCells(`A${r}:${END_COL}${r}`);
        ws.getCell(`A${r}`).value = `Giáo viên giảng dạy: ${teacherName}`;
        ws.getCell(`A${r}`).font = { name: 'Times New Roman', size: 12 };
        r++;
        ws.mergeCells(`A${r}:${END_COL}${r}`);
        ws.getCell(`A${r}`).value = `Bộ môn giảng dạy: ${Array.from(tData.subjects).join(', ')}`;
        ws.getCell(`A${r}`).font = { name: 'Times New Roman', size: 12 };
        r++;

        // DÒNG TIÊU ĐỀ BẢNG THỐNG KÊ (Dòng 10 & 11)
        ws.mergeCells(`A${r}:A${r+1}`); ws.getCell(`A${r}`).value = 'STT';
        ws.mergeCells(`B${r}:B${r+1}`); ws.getCell(`B${r}`).value = 'Lớp có\nHSKT';
        ws.mergeCells(`C${r}:C${r+1}`); ws.getCell(`C${r}`).value = 'Họ và tên học sinh khuyết tật';
        ws.mergeCells(`D${r}:D${r+1}`); ws.getCell(`D${r}`).value = 'Môn dạy';
        
        ws.mergeCells(`E${r}:${MONTH_END_COL}${r}`);
        ws.getCell(`E${r}`).value = 'Tổng số giờ dạy/tiết dạy trong kỳ\n(Ghi rõ môn dạy; số tiết thực dạy x số tuần)';
        
        months.forEach((m, idx) => {
          ws.getCell(`${getColLetter(5 + idx)}${r+1}`).value = `Tháng\n${m}`;
        });

        const SUM_COL_LETTER = getColLetter(TOTAL_COLS - 1);
        ws.mergeCells(`${SUM_COL_LETTER}${r}:${SUM_COL_LETTER}${r+1}`);
        ws.getCell(`${SUM_COL_LETTER}${r}`).value = `Tổng cộng số\ntiết dạy/tuần\ntrong kỳ ${config.semester} để\ntính hưởng PC`;

        ws.mergeCells(`${END_COL}${r}:${END_COL}${r+1}`);
        ws.getCell(`${END_COL}${r}`).value = 'Ghi chú\n(Công thức)';

        // Format Header
        for(let i=1; i<=TOTAL_COLS; i++) {
          const cTop = ws.getCell(`${getColLetter(i)}${r}`);
          const cBot = ws.getCell(`${getColLetter(i)}${r+1}`);
          [cTop, cBot].forEach(c => {
            c.font = { bold: true, name: 'Times New Roman', size: 11 };
            c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
            c.border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };
          });
        }
        r += 2;

        // DỮ LIỆU TỪNG HỌC SINH
        tData.records.forEach((rec, idx) => {
          const row = ws.getRow(r);
          row.height = 30;
          row.getCell(1).value = idx + 1;
          row.getCell(2).value = rec.className;
          row.getCell(3).value = rec.studentName;
          row.getCell(4).value = rec.subject;
          
          // Các tháng để trống cho GV điền tay (vì TKB không map theo tháng)
          // Đẩy tổng số tiết vào cột Tổng
          row.getCell(TOTAL_COLS - 1).value = rec.totalP;
          row.getCell(TOTAL_COLS - 1).font = { bold: true, color: { argb: 'FF0000' } };
          
          row.getCell(TOTAL_COLS).value = rec.formula;

          for(let i=1; i<=TOTAL_COLS; i++) {
            const cell = row.getCell(i);
            cell.font = cell.font || { name: 'Times New Roman', size: 11 };
            cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
            cell.border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };
          }
          r++;
        });

        // DÒNG TỔNG CỘNG CHÂN BẢNG
        ws.mergeCells(`A${r}:${MONTH_END_COL}${r}`);
        ws.getCell(`A${r}`).value = 'TỔNG CỘNG SỐ TIẾT DẠY';
        ws.getCell(`A${r}`).font = { bold: true, name: 'Times New Roman', size: 12 };
        ws.getCell(`A${r}`).alignment = { horizontal: 'center', vertical: 'middle' };
        
        ws.getCell(`${SUM_COL_LETTER}${r}`).value = tData.totalPeriods;
        ws.getCell(`${SUM_COL_LETTER}${r}`).font = { bold: true, name: 'Times New Roman', size: 12, underline: true };
        ws.getCell(`${SUM_COL_LETTER}${r}`).alignment = { horizontal: 'center', vertical: 'middle' };

        for(let i=1; i<=TOTAL_COLS; i++) {
          ws.getCell(`${getColLetter(i)}${r}`).border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };
        }
        r += 2;

        // PHẦN CHỮ KÝ
        ws.mergeCells(`A${r}:C${r}`);
        ws.getCell(`A${r}`).value = 'XÁC NHẬN CỦA TỔ CHUYÊN MÔN';
        ws.getCell(`A${r}`).font = { bold: true, name: 'Times New Roman', size: 12 };
        ws.getCell(`A${r}`).alignment = { horizontal: 'center' };
        r++;

        ws.mergeCells(`A${r}:E${r}`);
        ws.getCell(`A${r}`).value = `Tổng số tiết dạy được tính trong học kỳ ${config.semester} là:       ${tData.totalPeriods}       tiết`;
        ws.getCell(`A${r}`).font = { name: 'Times New Roman', size: 12 };
        r++;

        ws.mergeCells(`${getColLetter(TOTAL_COLS - 3)}${r}:${END_COL}${r}`);
        ws.getCell(`${getColLetter(TOTAL_COLS - 3)}${r}`).value = `Hòa Khánh, ngày       ${config.exportDate}`;
        ws.getCell(`${getColLetter(TOTAL_COLS - 3)}${r}`).font = { italic: true, name: 'Times New Roman', size: 12 };
        ws.getCell(`${getColLetter(TOTAL_COLS - 3)}${r}`).alignment = { horizontal: 'center' };
        r++;

        // Chia đều 4 chữ ký
        const sigSpan = Math.max(2, Math.floor(TOTAL_COLS / 4));
        
        ws.mergeCells(r, 1, r, sigSpan);
        ws.getCell(r, 1).value = 'Tổ trưởng chuyên môn';
        ws.getCell(r, 1).alignment = { horizontal: 'center' };

        ws.mergeCells(r, sigSpan + 1, r, sigSpan * 2);
        ws.getCell(r, sigSpan + 1).value = 'Phó Hiệu trưởng';
        ws.getCell(r, sigSpan + 1).alignment = { horizontal: 'center' };

        ws.mergeCells(r, sigSpan * 2 + 1, r, sigSpan * 3);
        ws.getCell(r, sigSpan * 2 + 1).value = 'Hiệu trưởng';
        ws.getCell(r, sigSpan * 2 + 1).alignment = { horizontal: 'center' };

        ws.mergeCells(r, sigSpan * 3 + 1, r, TOTAL_COLS);
        ws.getCell(r, sigSpan * 3 + 1).value = 'Người kê khai';
        ws.getCell(r, sigSpan * 3 + 1).alignment = { horizontal: 'center' };
        
        // Font in đậm cho hàng chức danh
        for(let i=1; i<=TOTAL_COLS; i++) {
          const c = ws.getCell(r, i);
          if(c.value) c.font = { bold: true, name: 'Times New Roman', size: 12 };
        }
        r += 4;

        // Điền tên
        ws.mergeCells(r, 1, r, sigSpan);
        ws.getCell(r, 1).value = config.ttcm;
        ws.getCell(r, 1).alignment = { horizontal: 'center' };

        ws.mergeCells(r, sigSpan + 1, r, sigSpan * 2);
        ws.getCell(r, sigSpan + 1).value = config.vicePrincipal;
        ws.getCell(r, sigSpan + 1).alignment = { horizontal: 'center' };

        ws.mergeCells(r, sigSpan * 2 + 1, r, sigSpan * 3);
        ws.getCell(r, sigSpan * 2 + 1).value = config.principal;
        ws.getCell(r, sigSpan * 2 + 1).alignment = { horizontal: 'center' };

        ws.mergeCells(r, sigSpan * 3 + 1, r, TOTAL_COLS);
        ws.getCell(r, sigSpan * 3 + 1).value = teacherName;
        ws.getCell(r, sigSpan * 3 + 1).alignment = { horizontal: 'center' };

        for(let i=1; i<=TOTAL_COLS; i++) {
          const c = ws.getCell(r, i);
          if(c.value) c.font = { bold: true, name: 'Times New Roman', size: 12 };
        }

      });

      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      saveAs(blob, `Bao_Cao_Khuyet_Tat_${config.semester}_${config.schoolYear}.xlsx`);

    } catch (error) {
      console.error(error);
      alert("Đã xảy ra lỗi trong quá trình tạo file Excel!");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-10 relative">
      {loadingData && (
        <div className="absolute inset-0 z-50 bg-white/70 flex items-center justify-center rounded-xl">
          <Loader2 className="w-8 h-8 text-emerald-600 animate-spin" />
        </div>
      )}
      
      <div className="bg-white p-6 rounded-xl shadow-sm border border-emerald-200">
        <h2 className="text-2xl font-bold text-gray-800 flex items-center mb-1">
          <FileSpreadsheet className="mr-2.5 text-emerald-600 h-7 w-7" /> 
          Báo cáo Kê khai Giờ dạy Khuyết tật (Mẫu 1)
        </h2>
        <p className="text-sm text-gray-500 mt-1">Cấu hình linh hoạt các thông số và xuất bảng kê khai tính phụ cấp theo chuẩn in ấn.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-200">
            <div className="flex items-center mb-4 border-b pb-2 border-gray-100">
              <Calendar className="w-5 h-5 mr-2 text-indigo-500" />
              <h3 className="font-bold text-gray-800">Thời gian áp dụng</h3>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">Học kỳ</label>
                <select className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm" value={config.semester} onChange={e => setConfig({...config, semester: e.target.value})}>
                  <option value="I">Học kỳ I</option>
                  <option value="II">Học kỳ II</option>
                  <option value="Hè">Dạy Hè</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">Năm học</label>
                <input type="text" className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm" value={config.schoolYear} onChange={e => setConfig({...config, schoolYear: e.target.value})} placeholder="VD: 2025-2026"/>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1">Từ tháng</label>
                  <input type="number" min="1" max="12" className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm" value={config.startMonth} onChange={e => setConfig({...config, startMonth: Number(e.target.value)})}/>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1">Đến tháng</label>
                  <input type="number" min="1" max="12" className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm" value={config.endMonth} onChange={e => setConfig({...config, endMonth: Number(e.target.value)})}/>
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
                <input type="text" className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm" value={config.principal} onChange={e => setConfig({...config, principal: e.target.value})}/>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">Phó Hiệu trưởng</label>
                <input type="text" className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm" value={config.vicePrincipal} onChange={e => setConfig({...config, vicePrincipal: e.target.value})}/>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">Tổ trưởng CM (Nếu có)</label>
                <input type="text" className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm" value={config.ttcm} onChange={e => setConfig({...config, ttcm: e.target.value})} placeholder="Để trống nếu tự ký"/>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">Ngày tháng góc ký</label>
                <input type="text" className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm" value={config.exportDate} onChange={e => setConfig({...config, exportDate: e.target.value})} placeholder="VD: tháng 5 năm 2026"/>
              </div>
            </div>
          </div>
        </div>

        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
            <div className="flex items-center mb-5 border-b pb-3 border-gray-100">
              <Users className="w-5 h-5 mr-2 text-indigo-600" />
              <h3 className="font-bold text-gray-800 text-lg">Danh sách Lớp có học sinh khuyết tật</h3>
            </div>

            <div className="flex flex-col sm:flex-row gap-2 mb-6 bg-gray-50 p-3 rounded-lg border border-gray-100">
              <select className="w-full sm:w-1/3 p-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none" value={newClass} onChange={e => setNewClass(e.target.value)}>
                <option value="">-- Chọn Lớp --</option>
                {allClassNames.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <input 
                type="text" 
                placeholder="Họ và tên học sinh khuyết tật..." 
                className="flex-1 p-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAddStudent()}
              />
              <button onClick={handleAddStudent} className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-lg flex items-center justify-center text-sm font-bold transition-colors">
                <Plus className="w-4 h-4 mr-1" /> Thêm
              </button>
            </div>

            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <table className="w-full text-left">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="p-3 text-sm font-bold text-gray-600 w-16 text-center">STT</th>
                    <th className="p-3 text-sm font-bold text-gray-600 w-24 text-center">LỚP</th>
                    <th className="p-3 text-sm font-bold text-gray-600">HỌ VÀ TÊN HỌC SINH</th>
                    <th className="p-3 text-sm font-bold text-gray-600 w-16 text-center">XÓA</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {students.map((student, idx) => (
                    <tr key={student.id} className="hover:bg-gray-50/50">
                      <td className="p-3 text-center text-gray-500 font-medium">{idx + 1}</td>
                      <td className="p-3 text-center font-bold text-indigo-600">{student.className}</td>
                      <td className="p-3 font-bold text-gray-800">{student.studentName}</td>
                      <td className="p-3 text-center">
                        <button onClick={() => handleRemoveStudent(student.id)} className="text-gray-400 hover:text-red-500 p-1.5 rounded-md hover:bg-red-50 transition-colors">
                          <Trash2 className="w-5 h-5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {students.length === 0 && (
                    <tr><td colSpan={4} className="p-8 text-center text-gray-500 italic">Chưa khai báo học sinh. Hãy chọn Lớp và điền Tên HS ở trên.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            
            <div className="mt-6 pt-5 border-t border-gray-100 flex items-center justify-between">
              <div className="text-sm text-gray-500">Tổng cộng: <strong className="text-indigo-600">{students.length}</strong> học sinh</div>
              <button 
                onClick={handleExportExcel}
                disabled={students.length === 0 || isExporting}
                className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-400 text-white px-6 py-3 rounded-lg flex items-center text-base font-bold transition-colors shadow-sm"
              >
                {isExporting ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <Download className="w-5 h-5 mr-2" />}
                {isExporting ? 'Đang tạo Excel...' : 'Xuất Báo Cáo Excel (Mẫu 1)'}
              </button>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
};

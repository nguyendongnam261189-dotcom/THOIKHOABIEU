import React, { useState, useEffect, useMemo } from 'react';
import { FileSpreadsheet, Settings, Users, Plus, Trash2, Download, Calendar, PenTool, Loader2, TableProperties, AlertTriangle, Upload, Save } from 'lucide-react';
import { Schedule, Teacher } from '../types';
import { scheduleService } from '../services/scheduleService';
import { teacherService } from '../services/teacherService';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';

interface DisabledStudent {
  id: string;
  className: string;
  studentName: string;
}

export const DisabilityReport: React.FC = () => {
  // =====================================================================
  // 1. STATE QUẢN LÝ DỮ LIỆU TKB VÀ GIÁO VIÊN
  // =====================================================================
  const [allSchedules, setAllSchedules] = useState<Schedule[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [versions, setVersions] = useState<{ name: string, configWeeks: number }[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    const loadData = async () => {
      setLoadingData(true);
      try {
        const [schedules, allTeachers, configs] = await Promise.all([
          scheduleService.getAllSchedules(),
          teacherService.getAllTeachers(),
          scheduleService.getVersionConfigs()
        ]);
        setAllSchedules(schedules);
        setTeachers(allTeachers);
        
        const names = Array.from(new Set(schedules.map(s => s.versionName || 'Mặc định'))).sort();
        const vs = names.map(n => {
          const cfg = configs.find(c => c.versionName === n);
          return { name: n, configWeeks: cfg?.appliedWeeks || 0 };
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
  
  const dynamicDepartments = useMemo(() => {
    return Array.from(new Set(teachers.map(t => t.group))).filter(Boolean).sort();
  }, [teachers]);

  // =====================================================================
  // 2. STATE CẤU HÌNH BÁO CÁO VÀ MA TRẬN TUẦN
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
  const [selectedExportDept, setSelectedExportDept] = useState<string>('');

  const months = useMemo(() => {
    const arr: number[] = [];
    if (config.startMonth <= config.endMonth) {
      for (let i = config.startMonth; i <= config.endMonth; i++) arr.push(i);
    } else {
      for (let i = config.startMonth; i <= 12; i++) arr.push(i);
      for (let i = 1; i <= config.endMonth; i++) arr.push(i);
    }
    return arr;
  }, [config.startMonth, config.endMonth]);

  const [weekMatrix, setWeekMatrix] = useState<Record<string, Record<number, number>>>(() => {
    const saved = localStorage.getItem('tkb_week_matrix');
    return saved ? JSON.parse(saved) : {};
  });

  useEffect(() => {
    localStorage.setItem('tkb_week_matrix', JSON.stringify(weekMatrix));
  }, [weekMatrix]);

  const handleMatrixChange = (vName: string, month: number, value: number) => {
    setWeekMatrix(prev => ({
      ...prev,
      [vName]: {
        ...(prev[vName] || {}),
        [month]: value
      }
    }));
  };

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

  // TÍNH NĂNG: XUẤT VÀ NHẬP DANH SÁCH HỌC SINH BẰNG EXCEL
  const handleBackupStudents = async () => {
    if (students.length === 0) return;
    try {
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('DanhSachHSKT');
      
      ws.columns = [
        { header: 'Lớp', key: 'class', width: 15 },
        { header: 'Họ và tên học sinh khuyết tật', key: 'name', width: 40 }
      ];
      
      ws.getRow(1).font = { bold: true, name: 'Times New Roman', size: 12 };
      
      students.forEach(s => {
        ws.addRow({ class: s.className, name: s.studentName });
      });

      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      saveAs(blob, `Danh_Sach_HSKT_HK${config.semester}_${config.schoolYear}.xlsx`);
    } catch (error) {
      console.error(error);
      alert("Lỗi khi xuất file danh sách!");
    }
  };

  const handleRestoreStudents = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(await file.arrayBuffer());
      const ws = wb.worksheets[0];
      
      if (!ws) throw new Error("File Excel không hợp lệ");

      const importedStudents: DisabledStudent[] = [];
      ws.eachRow((row, rowNumber) => {
        if (rowNumber > 1) { 
          const className = row.getCell(1).text?.trim();
          const studentName = row.getCell(2).text?.trim();
          if (className && studentName) {
            importedStudents.push({
              id: Date.now().toString() + Math.random().toString(36).substring(7),
              className,
              studentName
            });
          }
        }
      });

      if (importedStudents.length > 0) {
        setStudents(importedStudents); 
        alert(`Đã tải thành công ${importedStudents.length} học sinh từ file Excel!`);
      } else {
        alert("Không tìm thấy dữ liệu hợp lệ trong file Excel. Vui lòng kiểm tra lại cấu trúc cột.");
      }
    } catch (error) {
      console.error(error);
      alert("Lỗi khi đọc file Excel!");
    } finally {
      e.target.value = '';
    }
  };

  const isHDTNType = (subject: string): boolean => {
    const s = (subject || '').toUpperCase();
    return s.includes('HDTN') || s.includes('HĐTN') || s.includes('CHÀO CỜ') || s.includes('CC-') || s.includes('SHL') || s.includes('SINH HOẠT');
  };

  // =====================================================================
  // 3. THUẬT TOÁN XUẤT EXCEL: TỔNG HỢP VÀ CHI TIẾT
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
      
      const M = months.length; 
      const TOTAL_COLS = 4 + M + 2; 

      const teacherDataMap = new Map<string, { dept: string, subjects: Set<string>, records: any[], totalPeriods: number }>();
      const deptDataMap = new Map<string, { totalPeriods: number, teachers: { name: string, total: number }[] }>();
      let grandTotal = 0;

      // 1. TÍNH TOÁN DỮ LIỆU CHO TẤT CẢ GIÁO VIÊN
      students.forEach(student => {
        const classSchedules = allSchedules.filter(s => s.lop.split(',').map(c => c.trim()).includes(student.className));
        const tsMap = new Map<string, { teacher: string, subject: string }>();
        
        classSchedules.forEach(s => {
          if (s.giao_vien === 'Chưa rõ') return;
          // Quy tất cả các tiết GVCN thành môn 'HĐTN' chuẩn
          const subject = isHDTNType(s.mon) ? 'HĐTN' : s.mon;
          const key = `${s.giao_vien}|${subject}`;
          if (!tsMap.has(key)) tsMap.set(key, { teacher: s.giao_vien, subject });
        });

        tsMap.forEach(combo => {
          const monthlyDetails: Record<number, Record<number, number>> = {};
          let totalP = 0;

          versions.forEach(v => {
            const vName = v.name;
            const matrixV = weekMatrix[vName] || {};
            let count = 0; 
            const vSchedules = classSchedules.filter(s => s.versionName === vName && s.giao_vien === combo.teacher);
            
            // Nếu là HĐTN (GVCN) thì luôn ấn định là 3 tiết
            if (combo.subject === 'HĐTN') {
              count = vSchedules.some(s => isHDTNType(s.mon)) ? 3 : 0; 
            } else {
              count = vSchedules.filter(s => !isHDTNType(s.mon) && s.mon === combo.subject).length;
            }

            if (count > 0) {
              let vWeeks = 0;
              months.forEach(m => {
                const w = matrixV[m] || 0;
                if (w > 0) {
                  if (!monthlyDetails[m]) monthlyDetails[m] = {};
                  monthlyDetails[m][count] = (monthlyDetails[m][count] || 0) + w;
                  vWeeks += w;
                }
              });

              if (vWeeks > 0) totalP += count * vWeeks;
            }
          });

          if (totalP > 0) {
            if (!teacherDataMap.has(combo.teacher)) {
              const teacherInfo = teachers.find(t => t.name === combo.teacher);
              teacherDataMap.set(combo.teacher, { dept: teacherInfo?.group || 'Chung', subjects: new Set(), records: [], totalPeriods: 0 });
            }
            const tData = teacherDataMap.get(combo.teacher)!;
            tData.subjects.add(combo.subject);
            tData.totalPeriods += totalP;

            tData.records.push({
              className: student.className,
              studentName: student.studentName,
              subject: combo.subject,
              monthlyDetails,
              totalP
            });
          }
        });
      });

      if (teacherDataMap.size === 0) {
        alert("Không tìm thấy dữ liệu tiết dạy nào khớp với danh sách học sinh và Ma trận tuần bạn đã khai báo!");
        setIsExporting(false);
        return;
      }

      // 2. GOM NHÓM THEO TỔ CHUYÊN MÔN
      teacherDataMap.forEach((tData, tName) => {
        const dept = tData.dept;
        if (!deptDataMap.has(dept)) deptDataMap.set(dept, { totalPeriods: 0, teachers: [] });
        
        const dData = deptDataMap.get(dept)!;
        dData.teachers.push({ name: tName, total: tData.totalPeriods });
        dData.totalPeriods += tData.totalPeriods;
        grandTotal += tData.totalPeriods;
      });

      deptDataMap.forEach(dData => {
        dData.teachers.sort((a, b) => {
          const nameA = String(a.name).split(' ').pop() || '';
          const nameB = String(b.name).split(' ').pop() || '';
          return nameA.localeCompare(nameB, 'vi');
        });
      });

      // ================= CÁC HÀM VẼ SHEET EXCEL =================
      const createSummarySheet = (sheetName: string, title: string, col2Header: string, rows: {name: string, total: number}[], footerLabel: string, footerTotal: number) => {
        const safeName = sheetName.substring(0, 31).replace(/[\\/?*\[\]]/g, '');
        const ws = wb.addWorksheet(safeName);

        ws.columns = [
          { width: 8 },  // STT
          { width: 45 }, // Cột Tên GV / Tổ CM
          { width: 25 }, // Cột Tổng
          { width: 25 }  // Cột Ghi chú
        ];

        ws.mergeCells('A1:D1');
        ws.getCell('A1').value = title;
        ws.getCell('A1').font = { name: 'Times New Roman', size: 14, bold: true };
        ws.getCell('A1').alignment = { horizontal: 'center' };

        ws.mergeCells('A2:D2');
        ws.getCell('A2').value = `(HỌC KỲ ${config.semester.toUpperCase()} NĂM HỌC ${config.schoolYear})`;
        ws.getCell('A2').font = { name: 'Times New Roman', size: 12, italic: true };
        ws.getCell('A2').alignment = { horizontal: 'center' };

        const header = ws.getRow(4);
        header.values = ['STT', col2Header, 'Tổng số tiết KT', 'Ghi chú'];
        header.font = { name: 'Times New Roman', size: 12, bold: true };
        header.alignment = { horizontal: 'center', vertical: 'middle' };
        for(let i=1; i<=4; i++) header.getCell(i).border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };

        let r = 5;
        rows.forEach((row, idx) => {
          const hr = ws.getRow(r);
          hr.values = [idx + 1, row.name, row.total, ''];
          hr.font = { name: 'Times New Roman', size: 12 };
          hr.getCell(1).alignment = { horizontal: 'center' };
          hr.getCell(3).alignment = { horizontal: 'center', font: { bold: true } };
          for(let i=1; i<=4; i++) hr.getCell(i).border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };
          r++;
        });

        const footer = ws.getRow(r);
        footer.values = ['', footerLabel, footerTotal, ''];
        footer.font = { name: 'Times New Roman', size: 12, bold: true, color: { argb: 'FF0000' } };
        footer.getCell(3).alignment = { horizontal: 'center' };
        for(let i=1; i<=4; i++) footer.getCell(i).border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };

        r += 3;
        ws.mergeCells(`A${r}:B${r}`);
        ws.getCell(`A${r}`).value = 'Người lập bảng';
        ws.getCell(`A${r}`).font = { name: 'Times New Roman', size: 12, bold: true };
        ws.getCell(`A${r}`).alignment = { horizontal: 'center' };

        ws.mergeCells(`C${r}:D${r}`);
        ws.getCell(`C${r}`).value = `Hòa Khánh, ngày       ${config.exportDate}\nHiệu trưởng`;
        ws.getCell(`C${r}`).font = { name: 'Times New Roman', size: 12, bold: true };
        ws.getCell(`C${r}`).alignment = { horizontal: 'center', wrapText: true };
      };

      const createIndividualSheet = (teacherName: string, tData: any) => {
        const safeName = teacherName.substring(0, 31).replace(/[\\/?*\[\]]/g, '');
        const ws = wb.addWorksheet(safeName);

        ws.pageSetup = {
          paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0,
          margins: { left: 0.3, right: 0.3, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 }
        };

        const getColLetter = (colIndex: number) => {
          let temp = colIndex; let letter = '';
          while (temp > 0) {
            let modulo = (temp - 1) % 26;
            letter = String.fromCharCode(65 + modulo) + letter;
            temp = Math.floor((temp - modulo) / 26);
          }
          return letter;
        };

        const END_COL = getColLetter(TOTAL_COLS);
        const MONTH_END_COL = getColLetter(4 + M);
        const SUM_COL_LETTER = getColLetter(TOTAL_COLS - 1);

        ws.getColumn(1).width = 6;  
        ws.getColumn(2).width = 12; 
        ws.getColumn(3).width = 25; 
        ws.getColumn(4).width = 16; 
        for(let i = 1; i <= M; i++) ws.getColumn(4 + i).width = 16; 
        ws.getColumn(TOTAL_COLS - 1).width = 13; 
        ws.getColumn(TOTAL_COLS).width = 15;     

        let r = 1;
        ws.mergeCells(`A${r}:C${r}`); ws.getCell(`A${r}`).value = 'UBND PHƯỜNG HÒA KHÁNH'; ws.getCell(`A${r}`).alignment = { horizontal: 'center' };
        ws.mergeCells(`D${r}:${getColLetter(TOTAL_COLS - 1)}${r}`); ws.getCell(`D${r}`).value = 'CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM'; ws.getCell(`D${r}`).font = { bold: true, name: 'Times New Roman', size: 12 }; ws.getCell(`D${r}`).alignment = { horizontal: 'center' };
        ws.getCell(`${END_COL}${r}`).value = 'Mẫu 1'; ws.getCell(`${END_COL}${r}`).font = { bold: true, name: 'Times New Roman', size: 12 }; ws.getCell(`${END_COL}${r}`).alignment = { horizontal: 'right' };
        r++;

        ws.mergeCells(`A${r}:C${r}`); ws.getCell(`A${r}`).value = 'TRƯỜNG TRUNG HỌC CƠ SỞ'; ws.getCell(`A${r}`).alignment = { horizontal: 'center' };
        ws.mergeCells(`D${r}:${getColLetter(TOTAL_COLS - 1)}${r}`); ws.getCell(`D${r}`).value = 'Độc lập - Tự do - Hạnh phúc'; ws.getCell(`D${r}`).font = { bold: true, underline: true, name: 'Times New Roman', size: 12 }; ws.getCell(`D${r}`).alignment = { horizontal: 'center' };
        r++;

        ws.mergeCells(`A${r}:C${r}`); ws.getCell(`A${r}`).value = 'NGUYỄN BỈNH KHIÊM'; ws.getCell(`A${r}`).font = { bold: true, name: 'Times New Roman', size: 12 }; ws.getCell(`A${r}`).alignment = { horizontal: 'center' };
        r += 2;

        ws.mergeCells(`A${r}:${END_COL}${r}`); ws.getCell(`A${r}`).value = 'BẢNG KÊ KHAI SỐ GIỜ DẠY (TIẾT DẠY) Ở LỚP CÓ NGƯỜI KHUYẾT TẬT'; ws.getCell(`A${r}`).font = { bold: true, name: 'Times New Roman', size: 14 }; ws.getCell(`A${r}`).alignment = { horizontal: 'center' };
        r++;

        ws.mergeCells(`A${r}:${END_COL}${r}`); ws.getCell(`A${r}`).value = `HỌC KỲ ${config.semester.toUpperCase()} NĂM HỌC ${config.schoolYear} (TỪ THÁNG ${String(config.startMonth).padStart(2,'0')} ĐẾN THÁNG ${String(config.endMonth).padStart(2,'0')} NĂM ${config.exportDate.split('năm')[1]?.trim() || ''})`; ws.getCell(`A${r}`).font = { bold: true, name: 'Times New Roman', size: 12 }; ws.getCell(`A${r}`).alignment = { horizontal: 'center' };
        r += 2;

        // Đổi tên "HĐTN" thành "HĐTN (GVCN)" để in lên đầu Header cho dễ hiểu
        const displaySubjects = Array.from(tData.subjects).map(s => s === 'HĐTN' ? 'HĐTN (GVCN)' : s);

        ws.mergeCells(`A${r}:${END_COL}${r}`); ws.getCell(`A${r}`).value = `Giáo viên giảng dạy: ${teacherName}`; ws.getCell(`A${r}`).font = { name: 'Times New Roman', size: 12 };
        r++;
        ws.mergeCells(`A${r}:${END_COL}${r}`); ws.getCell(`A${r}`).value = `Bộ môn giảng dạy: ${displaySubjects.join(', ')}`; ws.getCell(`A${r}`).font = { name: 'Times New Roman', size: 12 };
        r++;

        ws.mergeCells(`A${r}:A${r+1}`); ws.getCell(`A${r}`).value = 'STT';
        ws.mergeCells(`B${r}:B${r+1}`); ws.getCell(`B${r}`).value = 'Lớp có\nHSKT';
        ws.mergeCells(`C${r}:C${r+1}`); ws.getCell(`C${r}`).value = 'Họ và tên học sinh khuyết tật';
        ws.mergeCells(`D${r}:D${r+1}`); ws.getCell(`D${r}`).value = 'Môn dạy';
        
        ws.mergeCells(`E${r}:${MONTH_END_COL}${r}`); ws.getCell(`E${r}`).value = 'Tổng số giờ dạy/tiết dạy trong kỳ\n(Ghi rõ môn dạy; số tiết thực dạy x số tuần)';
        months.forEach((m, idx) => { ws.getCell(`${getColLetter(5 + idx)}${r+1}`).value = `Tháng\n${m}`; });

        ws.mergeCells(`${SUM_COL_LETTER}${r}:${SUM_COL_LETTER}${r+1}`); ws.getCell(`${SUM_COL_LETTER}${r}`).value = `Tổng cộng số\ntiết dạy/tuần\ntrong kỳ ${config.semester} để\ntính hưởng PC`;
        ws.mergeCells(`${END_COL}${r}:${END_COL}${r+1}`); ws.getCell(`${END_COL}${r}`).value = 'Ghi chú';

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

        const colTotals: Record<number, number> = {};

        tData.records.forEach((rec: any, idx: number) => {
          const row = ws.getRow(r);
          row.height = 40; 
          row.getCell(1).value = idx + 1;
          row.getCell(2).value = rec.className;
          row.getCell(3).value = rec.studentName;
          
          // Nêu bật môn HĐTN (GVCN)
          row.getCell(4).value = rec.subject === 'HĐTN' ? 'HĐTN (GVCN)' : rec.subject;
          if (rec.subject === 'HĐTN') {
            row.getCell(4).font = { bold: true, italic: true, name: 'Times New Roman', size: 11, color: { argb: '0052cc' } };
          }
          
          months.forEach((m, mIdx) => {
            const details = rec.monthlyDetails[m];
            if (details) {
              const lines: string[] = [];
              let monthTotal = 0;
              Object.entries(details).forEach(([countStr, weeks]) => {
                const c = parseInt(countStr); const w = weeks as number;
                lines.push(`${c}t x ${w} tuần = ${c * w}`);
                monthTotal += (c * w);
              });
              row.getCell(5 + mIdx).value = lines.join('\n');
              colTotals[m] = (colTotals[m] || 0) + monthTotal;
            } else {
              row.getCell(5 + mIdx).value = '';
            }
          });

          row.getCell(TOTAL_COLS - 1).value = rec.totalP;
          row.getCell(TOTAL_COLS - 1).font = { bold: true, color: { argb: 'FF0000' } };
          row.getCell(TOTAL_COLS).value = '';

          for(let i=1; i<=TOTAL_COLS; i++) {
            const cell = row.getCell(i);
            cell.font = cell.font || { name: 'Times New Roman', size: 11 };
            cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
            cell.border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };
          }
          r++;
        });

        ws.mergeCells(`A${r}:D${r}`); ws.getCell(`A${r}`).value = 'TỔNG CỘNG SỐ TIẾT DẠY'; ws.getCell(`A${r}`).font = { bold: true, name: 'Times New Roman', size: 12 }; ws.getCell(`A${r}`).alignment = { horizontal: 'center', vertical: 'middle' };
        
        months.forEach((m, mIdx) => {
          ws.getCell(`${getColLetter(5 + mIdx)}${r}`).value = colTotals[m] || 0;
          ws.getCell(`${getColLetter(5 + mIdx)}${r}`).font = { bold: true, name: 'Times New Roman', size: 12 };
          ws.getCell(`${getColLetter(5 + mIdx)}${r}`).alignment = { horizontal: 'center', vertical: 'middle' };
        });

        ws.getCell(`${SUM_COL_LETTER}${r}`).value = tData.totalPeriods;
        ws.getCell(`${SUM_COL_LETTER}${r}`).font = { bold: true, name: 'Times New Roman', size: 13, underline: true, color: { argb: 'FF0000' } };
        ws.getCell(`${SUM_COL_LETTER}${r}`).alignment = { horizontal: 'center', vertical: 'middle' };

        for(let i=1; i<=TOTAL_COLS; i++) {
          ws.getCell(`${getColLetter(i)}${r}`).border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };
        }
        r += 2;

        ws.mergeCells(`A${r}:D${r}`); ws.getCell(`A${r}`).value = 'XÁC NHẬN CỦA TỔ CHUYÊN MÔN'; ws.getCell(`A${r}`).font = { bold: true, name: 'Times New Roman', size: 12 }; ws.getCell(`A${r}`).alignment = { horizontal: 'center' };
        r++;
        ws.mergeCells(`A${r}:E${r}`); ws.getCell(`A${r}`).value = `Tổng số tiết dạy được tính trong học kỳ ${config.semester} là:       ${tData.totalPeriods}       tiết`; ws.getCell(`A${r}`).font = { name: 'Times New Roman', size: 12 };
        r++;
        ws.mergeCells(`${getColLetter(TOTAL_COLS - 3)}${r}:${END_COL}${r}`); ws.getCell(`${getColLetter(TOTAL_COLS - 3)}${r}`).value = `Hòa Khánh, ngày       ${config.exportDate}`; ws.getCell(`${getColLetter(TOTAL_COLS - 3)}${r}`).font = { italic: true, name: 'Times New Roman', size: 12 }; ws.getCell(`${getColLetter(TOTAL_COLS - 3)}${r}`).alignment = { horizontal: 'center' };
        r++;

        const sigSpan = Math.max(2, Math.floor(TOTAL_COLS / 4));
        
        ws.mergeCells(r, 1, r, sigSpan); ws.getCell(r, 1).value = 'Tổ trưởng chuyên môn'; ws.getCell(r, 1).alignment = { horizontal: 'center' };
        ws.mergeCells(r, sigSpan + 1, r, sigSpan * 2); ws.getCell(r, sigSpan + 1).value = 'Phó Hiệu trưởng'; ws.getCell(r, sigSpan + 1).alignment = { horizontal: 'center' };
        ws.mergeCells(r, sigSpan * 2 + 1, r, sigSpan * 3); ws.getCell(r, sigSpan * 2 + 1).value = 'Hiệu trưởng'; ws.getCell(r, sigSpan * 2 + 1).alignment = { horizontal: 'center' };
        ws.mergeCells(r, sigSpan * 3 + 1, r, TOTAL_COLS); ws.getCell(r, sigSpan * 3 + 1).value = 'Người kê khai'; ws.getCell(r, sigSpan * 3 + 1).alignment = { horizontal: 'center' };
        for(let i=1; i<=TOTAL_COLS; i++) { const c = ws.getCell(r, i); if(c.value) c.font = { bold: true, name: 'Times New Roman', size: 12 }; }
        r += 4;

        ws.mergeCells(r, 1, r, sigSpan); ws.getCell(r, 1).value = config.ttcm; ws.getCell(r, 1).alignment = { horizontal: 'center' };
        ws.mergeCells(r, sigSpan + 1, r, sigSpan * 2); ws.getCell(r, sigSpan + 1).value = config.vicePrincipal; ws.getCell(r, sigSpan + 1).alignment = { horizontal: 'center' };
        ws.mergeCells(r, sigSpan * 2 + 1, r, sigSpan * 3); ws.getCell(r, sigSpan * 2 + 1).value = config.principal; ws.getCell(r, sigSpan * 2 + 1).alignment = { horizontal: 'center' };
        ws.mergeCells(r, sigSpan * 3 + 1, r, TOTAL_COLS); ws.getCell(r, sigSpan * 3 + 1).value = teacherName; ws.getCell(r, sigSpan * 3 + 1).alignment = { horizontal: 'center' };
        for(let i=1; i<=TOTAL_COLS; i++) { const c = ws.getCell(r, i); if(c.value) c.font = { bold: true, name: 'Times New Roman', size: 12 }; }
      };

      // ================= ĐIỀU HƯỚNG LOGIC XUẤT (LỌC HAY TOÀN TRƯỜNG) =================
      if (selectedExportDept) {
        const dData = deptDataMap.get(selectedExportDept);
        if (!dData) {
          alert(`Không có giáo viên nào thuộc Tổ "${selectedExportDept}" có dạy lớp khuyết tật!`);
          setIsExporting(false); return;
        }
        createSummarySheet(`TH - ${selectedExportDept}`, `TỔNG HỢP TIẾT DẠY KHUYẾT TẬT - TỔ ${selectedExportDept.toUpperCase()}`, 'Họ và tên giáo viên', dData.teachers, 'TỔNG CỘNG TOÀN TỔ', dData.totalPeriods);
        dData.teachers.forEach(t => {
          const tData = teacherDataMap.get(t.name)!;
          createIndividualSheet(t.name, tData);
        });
      } else {
        if (deptDataMap.size === 0) { alert("Không có dữ liệu!"); setIsExporting(false); return; }
        const schoolRows = Array.from(deptDataMap.entries()).map(([dName, data]) => ({ name: `Tổ ${dName}`, total: data.totalPeriods }));
        createSummarySheet('TH - TOÀN TRƯỜNG', 'TỔNG HỢP TIẾT DẠY KHUYẾT TẬT - TOÀN TRƯỜNG', 'Tổ chuyên môn', schoolRows, 'TỔNG CỘNG TOÀN TRƯỜNG', grandTotal);
        deptDataMap.forEach((data, deptName) => {
          createSummarySheet(`TH - ${deptName}`, `TỔNG HỢP TIẾT DẠY KHUYẾT TẬT - TỔ ${deptName.toUpperCase()}`, 'Họ và tên giáo viên', data.teachers, 'TỔNG CỘNG TOÀN TỔ', data.totalPeriods);
        });
      }

      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const fileName = `Bao_Cao_Khuyet_Tat_${selectedExportDept ? selectedExportDept.replace(/\s+/g, '_') : 'Toan_Truong'}_HK${config.semester}.xlsx`;
      saveAs(blob, fileName);

    } catch (error) {
      console.error(error);
      alert("Đã xảy ra lỗi trong quá trình tạo file Excel!");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-10 relative">
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
        <p className="text-sm text-gray-500 mt-1">Hệ thống phân bổ tự động số tiết dạy vào từng tháng dựa trên Ma trận thực dạy.</p>
      </div>

      {/* ===================================================================== */}
      {/* KHU VỰC MA TRẬN PHÂN BỔ TUẦN (CÓ CẢNH BÁO THÔNG MINH) */}
      {/* ===================================================================== */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-indigo-200">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-indigo-900 flex items-center">
            <TableProperties className="w-5 h-5 mr-2" /> Ma trận Phân bổ Số tuần Thực dạy
          </h3>
          <span className="text-xs font-bold bg-indigo-50 text-indigo-600 px-3 py-1 rounded-full border border-indigo-100">
            Dữ liệu tự động lưu
          </span>
        </div>
        
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full text-center border-collapse">
            <thead>
              <tr className="bg-gray-50">
                <th className="p-3 border-b border-r border-gray-200 font-bold text-gray-600 text-sm w-48 text-left">Phiên bản TKB</th>
                {months.map(m => (
                  <th key={m} className="p-3 border-b border-r border-gray-200 font-bold text-indigo-700 text-sm">
                    Tháng {m}
                  </th>
                ))}
                <th className="p-3 border-b border-gray-200 font-bold text-gray-600 text-sm bg-gray-100 w-40">Tổng Ma trận</th>
              </tr>
            </thead>
            <tbody>
              {versions.map(v => {
                const vName = v.name;
                const vTotalMatrix = months.reduce((sum, m) => sum + (weekMatrix[vName]?.[m] || 0), 0);
                const isMismatch = vTotalMatrix !== v.configWeeks;

                return (
                  <tr key={vName} className="hover:bg-indigo-50/30 transition-colors">
                    <td className="p-3 border-b border-r border-gray-200 font-bold text-gray-800 text-sm text-left">
                      {vName}
                    </td>
                    {months.map(m => (
                      <td key={m} className="p-2 border-b border-r border-gray-200">
                        <input 
                          type="number" min="0" 
                          className="w-16 text-center border border-gray-300 rounded-md p-1.5 font-bold text-indigo-700 focus:ring-2 focus:ring-indigo-500 outline-none" 
                          value={weekMatrix[vName]?.[m] || ''}
                          onChange={e => handleMatrixChange(vName, m, parseInt(e.target.value) || 0)}
                          placeholder="-"
                        />
                      </td>
                    ))}
                    <td className={`p-3 border-b border-gray-200 font-black text-sm ${isMismatch ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-700'}`}>
                      <div className="flex items-center justify-center">
                        {vTotalMatrix} <span className="text-xs font-normal ml-1">tuần</span>
                        {isMismatch && (
                          <div className="group relative ml-2">
                            <AlertTriangle className="w-4 h-4 cursor-help" />
                            <div className="absolute hidden group-hover:block bottom-full left-1/2 transform -translate-x-1/2 mb-2 w-48 p-2 bg-gray-800 text-white text-xs rounded shadow-lg z-10 font-normal">
                              Bên trang Dữ liệu (Admin) đang cấu hình là <b>{v.configWeeks}</b> tuần. Hãy kiểm tra lại!
                            </div>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-indigo-50 font-bold">
                <td className="p-3 border-t border-r border-indigo-100 text-right text-indigo-900 text-sm">TỔNG CỘNG CHUNG:</td>
                {months.map(m => {
                  const mTotal = versions.reduce((sum, v) => sum + (weekMatrix[v.name]?.[m] || 0), 0);
                  return (
                    <td key={m} className="p-3 border-t border-r border-indigo-100 text-indigo-700">
                      {mTotal}
                    </td>
                  );
                })}
                <td className="p-3 border-t border-indigo-100 text-red-600 text-lg">
                  {months.reduce((gSum, m) => gSum + versions.reduce((sum, v) => sum + (weekMatrix[v.name]?.[m] || 0), 0), 0)} <span className="text-sm font-normal text-red-400">tuần</span>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
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

            <div className="flex items-center justify-between mb-3 mt-4">
              <h4 className="text-sm font-bold text-gray-700">Danh sách đã thêm ({students.length})</h4>
              <div className="flex gap-2">
                <label className="cursor-pointer flex items-center px-3 py-1.5 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-md text-xs font-bold transition-colors border border-indigo-100">
                  <Upload className="w-3.5 h-3.5 mr-1" /> Nhập từ file
                  <input type="file" accept=".xlsx, .xls" className="hidden" onChange={handleRestoreStudents} />
                </label>
                <button 
                  onClick={handleBackupStudents}
                  disabled={students.length === 0}
                  className="flex items-center px-3 py-1.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 disabled:opacity-50 disabled:cursor-not-allowed rounded-md text-xs font-bold transition-colors border border-emerald-100"
                >
                  <Save className="w-3.5 h-3.5 mr-1" /> Lưu danh sách
                </button>
              </div>
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
            
            <div className="mt-6 pt-5 border-t border-gray-100 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div className="text-sm text-gray-500">
                Tổng cộng: <strong className="text-indigo-600">{students.length}</strong> học sinh
              </div>
              
              <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
                <select 
                  className="px-4 py-3 border border-emerald-300 rounded-xl text-sm font-bold text-emerald-900 bg-emerald-50 outline-none focus:border-emerald-500 w-full sm:w-56 shadow-sm"
                  value={selectedExportDept}
                  onChange={(e) => setSelectedExportDept(e.target.value)}
                >
                  <option value="">Xuất Tất cả các Tổ</option>
                  {dynamicDepartments.map(d => <option key={d} value={d}>Chỉ xuất Tổ {d}</option>)}
                </select>

                <button 
                  onClick={handleExportExcel}
                  disabled={students.length === 0 || isExporting || versions.length === 0}
                  className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-400 text-white px-6 py-3 rounded-xl flex items-center justify-center text-base font-bold transition-colors shadow-sm w-full sm:w-auto"
                >
                  {isExporting ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <Download className="w-5 h-5 mr-2" />}
                  {isExporting ? 'Đang tạo Excel...' : 'Xuất Báo Cáo (Mẫu 1)'}
                </button>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
};

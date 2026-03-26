import * as XLSX from 'xlsx';
import { Schedule, Teacher } from '../types';

// Hàm chuẩn hóa ID giáo viên
const generateTeacherId = (name: string): string => {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]/g, '_')
    .replace(/_+/g, '_')
    .trim();
};

const getDepartmentFromSheetName = (sheetName: string): string => {
  const name = sheetName.toUpperCase();
  if (name.includes('_NN')) return 'Ngoại ngữ';
  if (name.includes('_KHTN') || name.includes('_CN_') || name.endsWith('_CN')) return 'KHTN và Công nghệ';
  if (name.includes('_SĐ') || name.includes('_SD')) return 'Sử - Địa';
  if (name.includes('_T_') || name.endsWith('_T')) return 'Toán - Tin';
  if (name.includes('_TM')) return 'Nghệ thuật - Thể chất';
  if (name.includes('_V_') || name.endsWith('_V')) return 'Văn - GDCD';
  return 'Chung';
};

const formatClassName = (className: any): string => {
  if (!className) return '';
  let str = String(className).trim();
  return str.replace(/\./g, '/').replace(/\s+/g, '');
};

const cleanString = (str: any): string => {
  if (str === null || str === undefined) return '';
  return String(str).normalize('NFC').trim();
};

export const parseExcelFile = async (file: File): Promise<{ schedules: Schedule[], teachers: Teacher[] }> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });

        let uniqueSchedules: Map<string, Schedule> = new Map();
        let allTeachersMap: Map<string, Teacher> = new Map();

        const teacherDepartmentDict = new Map<string, string>();
        workbook.SheetNames.forEach(sheetName => {
            if (sheetName.includes('TKB_GV') && !sheetName.includes('PCGD')) {
                const department = getDepartmentFromSheetName(sheetName);
                const worksheet = workbook.Sheets[sheetName];
                const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[];
                for (let i = 0; i < Math.min(15, jsonData.length); i++) {
                    const row = jsonData[i] || [];
                    const rowStr = row.map((c: any) => String(c).toLowerCase()).join('');
                    if (rowStr.includes('thứ') || rowStr.includes('thu')) {
                        for(let c = 2; c < row.length; c++) { 
                            let teacherName = cleanString(row[c]);
                            if (teacherName && teacherName.toLowerCase() !== 'sáng' && teacherName.toLowerCase() !== 'chiều') {
                                teacherDepartmentDict.set(teacherName, department);
                            }
                        }
                        break; 
                    }
                }
            }
        });

        const knownSubjects = new Set<string>(['Toán', 'Văn', 'Anh', 'AVăn', 'Lý', 'Hóa', 'Sinh', 'Sử', 'Địa', 'GDCD', 'Tin', 'CNghệ', 'Công nghệ', 'GDTC', 'Thể dục', 'Nghệ thuật', 'Âm nhạc', 'Mỹ thuật', 'KHTN', 'Lịch sử', 'Địa lý', 'HĐTNHN', 'CC-HĐTNHN', 'SHL', 'Chào cờ']);
        const sortedKnownSubjects = Array.from(knownSubjects).sort((a, b) => b.length - a.length);

        workbook.SheetNames.forEach(sheetName => {
          if (sheetName.toUpperCase().includes('PCGD') || sheetName.toUpperCase().includes('PHONGHOC')) return;
          const worksheet = workbook.Sheets[sheetName];
          const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[];
          if (jsonData.length === 0) return;

          let globalBuoi: 'Sáng' | 'Chiều' = (sheetName.endsWith('_C') || sheetName.includes('_C_')) ? 'Chiều' : 'Sáng';
          let headerRowIdx = -1, thuColIdx = -1, tietColIdx = -1;

          for (let i = 0; i < Math.min(15, jsonData.length); i++) {
            const row = jsonData[i] || [];
            let fThu = -1, fTiet = -1;
            for (let c = 0; c < Math.min(5, row.length); c++) {
              const s = cleanString(row[c]).toLowerCase();
              if (s.includes('thứ') && fThu === -1) fThu = c;
              if (s.includes('tiết') && fTiet === -1) fTiet = c;
            }
            if (fThu !== -1 && fTiet !== -1) { headerRowIdx = i; thuColIdx = fThu; tietColIdx = fTiet; break; }
          }

          if (headerRowIdx !== -1) {
            const headerRow1 = jsonData[headerRowIdx] || [];
            const colMap: { [key: number]: { name: string, buoi: 'Sáng' | 'Chiều' } } = {};
            for (let c = 0; c < headerRow1.length; c++) {
              const val = cleanString(headerRow1[c]);
              if (c !== thuColIdx && c !== tietColIdx && val && val.length > 1) {
                colMap[c] = { name: val.replace(/\s*\(.*\)/, '').trim(), buoi: globalBuoi };
              }
            }

            let currentThu = 2;
            for (let i = headerRowIdx + 1; i < jsonData.length; i++) {
              const row = jsonData[i] || [];
              const rowThu = cleanString(row[thuColIdx]);
              if (rowThu) { const m = rowThu.match(/\d+/); if (m) currentThu = parseInt(m[0]); }
              
              const currentTiet = parseInt(cleanString(row[tietColIdx]));
              if (!isNaN(currentTiet)) {
                for (let c = 0; c < row.length; c++) {
                  if (colMap[c]) {
                    const cellData = cleanString(row[c]);
                    if (cellData) {
                      let mon = sortedKnownSubjects.find(s => cellData.toUpperCase().startsWith(s.toUpperCase())) || 'Môn khác';
                      let secondary = cellData.substring(mon.length).replace(/^[-\n\s]+/, '').trim();
                      
                      let lopRaw = sheetName.includes('LOP') ? colMap[c].name : secondary;
                      let gvRaw = sheetName.includes('LOP') ? secondary : colMap[c].name;

                      if (!gvRaw || gvRaw === 'Chưa xếp') continue;

                      const scheduleObj: Schedule = {
                        thu: currentThu,
                        tiet: currentTiet > 5 ? currentTiet - 5 : currentTiet,
                        lop: formatClassName(lopRaw),
                        mon: mon,
                        giao_vien: gvRaw,
                        buoi: currentTiet > 5 ? 'Chiều' : colMap[c].buoi,
                        phong: ''
                      };

                      if (!allTeachersMap.has(gvRaw)) {
                        allTeachersMap.set(gvRaw, {
                          name: gvRaw,
                          subject: mon,
                          group: teacherDepartmentDict.get(gvRaw) || 'Chung'
                        });
                      }

                      const key = `${scheduleObj.thu}-${scheduleObj.buoi}-${scheduleObj.tiet}-${gvRaw}-${mon}`;
                      uniqueSchedules.set(key, scheduleObj);
                    }
                  }
                }
              }
            }
          }
        });

        resolve({ 
          schedules: Array.from(uniqueSchedules.values()), 
          teachers: Array.from(allTeachersMap.values()) 
        });
      } catch (error) { reject(error); }
    };
    reader.readAsArrayBuffer(file);
  });
};

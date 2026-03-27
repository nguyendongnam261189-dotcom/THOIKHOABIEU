import * as XLSX from 'xlsx';
import { Schedule, Teacher } from '../types';

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

const isProfessionalSubject = (subject: string): boolean => {
  if (!subject) return false;
  const s = subject.toUpperCase();
  const nonProfessional = ['SHL', 'CHÀO CỜ', 'CC-', 'CC', 'GDĐP', 'ĐỊA PHƯƠNG'];
  // HĐTN chỉ bị lọc nếu giáo viên có nhiều môn khác. Nếu là môn duy nhất sẽ được giữ lại ở bước sau.
  return !nonProfessional.some(keyword => s.includes(keyword)) && !s.includes('HĐTN') && !s.includes('HDTN');
};

const inferDepartmentFromSubject = (subject: string): string | null => {
  if (!subject) return null;
  const s = subject.toUpperCase();
  if (s.includes('ANH') || s.includes('AVĂN')) return 'Ngoại ngữ';
  if (s.includes('VĂN') || s.includes('GDCD')) return 'Văn - GDCD';
  if (s.includes('KHTN') || s.includes('HÓA') || s.includes('LÝ') || s.includes('SINH') || s.includes('CÔNG NGHỆ') || s.includes('CNGHỆ')) return 'KHTN và Công nghệ';
  if (s.includes('SỬ') || s.includes('ĐỊA') || s.includes('LỊCH SỬ') || s.includes('ĐỊA LÝ')) return 'Sử - Địa';
  if (s.includes('GDTC') || s.includes('THỂ DỤC') || s.includes('NGHỆ THUẬT') || s.includes('ÂM NHẠC') || s.includes('MỸ THUẬT')) return 'Nghệ thuật - Thể chất';
  if (s.includes('TOÁN') || s.includes('TIN')) return 'Toán - Tin';
  return null;
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

const generateFixedId = (name: string): string => {
  return name.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .replace(/[^a-z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
};

// Hàm chuẩn hóa tên viết tắt để so khớp (ví dụ: Oanh.A -> OANHA)
const normalizeShortName = (name: string): string => {
  return name.toUpperCase().replace(/[^A-ZĐÀÁẢÃẠĂẰẮẲẴẶÂẦẤẨẪẬÈÉẺẼẸÊỀẾỂỄỆÌÍỈĨỊÒÓỎÕỌÔỒỐỔỖỘƠỜỚỞỠỢÙÚỦŨỤƯỪỨỬỮỰỲÝỶỸỴ]/g, '');
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

        // 1. ĐỌC TỔ TỪ SHEET
        workbook.SheetNames.forEach(sheetName => {
          if (sheetName.includes('TKB_GV') && !sheetName.includes('PCGD')) {
            const department = getDepartmentFromSheetName(sheetName);
            const worksheet = workbook.Sheets[sheetName];
            const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[];
            for (let i = 0; i < Math.min(15, jsonData.length); i++) {
              const row = jsonData[i] || [];
              const rowStr = row.map((c: any) => String(c).toLowerCase()).join('');
              if (rowStr.includes('thứ') || rowStr.includes('tiết')) {
                for (let c = 2; c < row.length; c++) {
                  let teacherName = cleanString(row[c]);
                  if (teacherName && !['sáng', 'chiều'].includes(teacherName.toLowerCase())) {
                    teacherDepartmentDict.set(teacherName, department);
                  }
                }
                break;
              }
            }
          }
        });

        // 2. ĐỌC MÔN HỌC TỪ PCGD (PCGD_Subjects)
        const knownSubjects = new Set<string>();
        const pcgdSheetName = workbook.SheetNames.find(name => name.toUpperCase().includes('PCGD') || name.toUpperCase().includes('PHÂN CÔNG'));
        if (pcgdSheetName) {
          const worksheet = workbook.Sheets[pcgdSheetName];
          const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[];
          let pccmColIdx = -1, headerRowIdx = -1;
          for (let i = 0; i < Math.min(10, jsonData.length); i++) {
            const row = jsonData[i] || [];
            for (let c = 0; c < row.length; c++) {
              const cellStr = cleanString(row[c]).toLowerCase();
              if (cellStr.includes('chuyên môn') || cellStr.includes('môn dạy')) { pccmColIdx = c; headerRowIdx = i; break; }
            }
            if (pccmColIdx !== -1) break;
          }
          if (pccmColIdx !== -1) {
            for (let i = headerRowIdx + 1; i < jsonData.length; i++) {
              const row = jsonData[i] || [];
              const cellData = cleanString(row[pccmColIdx]);
              if (cellData) {
                cellData.split('\n').forEach(line => {
                  line.split('+').forEach(part => {
                    const subject = part.replace(/\s*\(.*?\)\s*/g, '').trim();
                    if (subject) knownSubjects.add(subject);
                  });
                });
              }
            }
          }
        }
        ['Toán', 'Văn', 'Anh', 'AVăn', 'Lý', 'Hóa', 'Sinh', 'Sử', 'Địa', 'GDCD', 'Tin', 'Công nghệ', 'GDTC', 'Nghệ thuật', 'KHTN', 'Lịch sử', 'Địa lý', 'HĐTNHN', 'SHL', 'Chào cờ'].forEach(s => knownSubjects.add(s));
        const sortedKnownSubjects = Array.from(knownSubjects).sort((a, b) => b.length - a.length);

        // 3. ĐỌC TKB
        workbook.SheetNames.forEach(sheetName => {
          if (sheetName.toUpperCase().includes('PCGD') || sheetName.toUpperCase().includes('PHONGHOC')) return;
          const worksheet = workbook.Sheets[sheetName];
          const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[];
          if (jsonData.length === 0) return;
          let headerRowIdx = -1, thuColIdx = -1, tietColIdx = -1;
          for (let i = 0; i < Math.min(15, jsonData.length); i++) {
            const row = jsonData[i] || [];
            let fThu = -1, fTiet = -1;
            for (let c = 0; c < Math.min(5, row.length); c++) {
              const cellStr = cleanString(row[c]).toLowerCase();
              if (cellStr.includes('thứ') && fThu === -1) fThu = c;
              if (cellStr.includes('tiết') && fTiet === -1) fTiet = c;
            }
            if (fThu !== -1 && fTiet !== -1) { headerRowIdx = i; thuColIdx = fThu; tietColIdx = fTiet; break; }
          }
          if (headerRowIdx !== -1) {
            const headerRow1 = jsonData[headerRowIdx] || [];
            const colMap: { [key: number]: { headerName: string, buoi: 'Sáng' | 'Chiều' } } = {};
            for (let c = 0; c < headerRow1.length; c++) {
              const val = cleanString(headerRow1[c]);
              if (c !== thuColIdx && c !== tietColIdx && val && val.length > 1) {
                colMap[c] = { headerName: val.replace(/\s*\(.*\)/, '').trim(), buoi: (sheetName.endsWith('_C') || sheetName.includes('_C_')) ? 'Chiều' : 'Sáng' };
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
                      let lopRaw = sheetName.includes('LOP') ? colMap[c].headerName : secondary;
                      let gvRaw = sheetName.includes('LOP') ? secondary : colMap[c].headerName;
                      const scheduleObj: Schedule = {
                        thu: currentThu, tiet: currentTiet > 5 ? currentTiet - 5 : currentTiet,
                        lop: lopRaw, mon: mon, giao_vien: gvRaw, phong: '',
                        buoi: currentTiet > 5 ? 'Chiều' : colMap[c].buoi
                      };
                      const key = `${currentThu}-${scheduleObj.buoi}-${currentTiet}-${gvRaw}-${mon}`;
                      if (!uniqueSchedules.has(key)) uniqueSchedules.set(key, scheduleObj);
                      if (!allTeachersMap.has(gvRaw)) {
                        allTeachersMap.set(gvRaw, { name: gvRaw, subject: mon, group: teacherDepartmentDict.get(gvRaw) || 'Chung' });
                      } else {
                        const t = allTeachersMap.get(gvRaw)!;
                        const subs = new Set(t.subject.split(', ').filter(Boolean));
                        subs.add(mon);
                        t.subject = Array.from(subs).join(', ');
                      }
                    }
                  }
                }
              }
            }
          }
        });

        // 4. ĐỐI SOÁT TÊN THÔNG MINH (PCGD Mapping)
        const shortToFullName = new Map<string, string>();
        const pcgdTeachers: { fullName: string, uniqueName: string, classes: Set<string>, lastName: string }[] = [];
        if (pcgdSheetName) {
          const worksheet = workbook.Sheets[pcgdSheetName];
          const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[];
          let nameCol = -1, pccmCol = -1, hIdx = -1;
          for (let i = 0; i < Math.min(15, jsonData.length); i++) {
            const row = jsonData[i] || [];
            row.forEach((cell: any, idx: number) => {
              const s = cleanString(cell).toLowerCase();
              if (s === 'họ và tên' || s === 'họ tên') nameCol = idx;
              if (s.includes('chuyên môn')) pccmCol = idx;
            });
            if (nameCol !== -1) { hIdx = i; break; }
          }
          if (nameCol !== -1) {
            for (let i = hIdx + 1; i < jsonData.length; i++) {
              const row = jsonData[i] || [];
              const fName = cleanString(row[nameCol]);
              if (!fName || fName.length < 4) continue;
              const pccm = pccmCol !== -1 ? cleanString(row[pccmCol]) : '';
              const cMatches = pccm.match(/\d{1,2}\s*[./]\s*\d{1,2}/g) || [];
              pcgdTeachers.push({ 
                fullName: fName, uniqueName: fName, lastName: fName.split(' ').pop() || '',
                classes: new Set(cMatches.map(c => formatClassName(c))) 
              });
            }
          }

          const tkbTeacherData = new Map<string, { classes: Set<string> }>();
          uniqueSchedules.forEach(s => {
            if (!tkbTeacherData.has(s.giao_vien)) tkbTeacherData.set(s.giao_vien, { classes: new Set() });
            s.lop.split(',').forEach(c => { 
              const cl = formatClassName(c); if (cl && cl !== 'CHƯAXẾP') tkbTeacherData.get(s.giao_vien)!.classes.add(cl); 
            });
          });

          allTeachersMap.forEach((teacher, shortName) => {
            const tkbClasses = tkbTeacherData.get(shortName)?.classes || new Set();
            const normShort = normalizeShortName(shortName);
            let bestMatch = null, maxScore = -1;

            pcgdTeachers.forEach(cand => {
              let score = 0;
              tkbClasses.forEach(c => { if (cand.classes.has(c)) score += 2000; }); // Ưu tiên lớp dạy rất cao
              const normFull = normalizeShortName(cand.fullName);
              const candLast = cand.lastName.toUpperCase();

              if (normFull === normShort) score += 1000;
              else if (normFull.includes(normShort) || normShort.includes(candLast)) score += 500;
              
              if (score > maxScore) { maxScore = score; bestMatch = cand; }
            });
            shortToFullName.set(shortName, (bestMatch && maxScore >= 500) ? (bestMatch as any).uniqueName : shortName);
          });
        }

        // 5. KẾT XUẤT VÀ LỌC MÔN THỰC TẾ
        const finalSchedules = Array.from(uniqueSchedules.values()).map(s => ({
          ...s,
          giao_vien: shortToFullName.get(s.giao_vien) || s.giao_vien,
          lop: s.lop.split(',').map(item => formatClassName(item)).join(', ')
        }));

        const mergedTeachersMap = new Map<string, Teacher>();
        Array.from(allTeachersMap.values()).forEach(t => {
          const mappedName = shortToFullName.get(t.name) || t.name;
          let subjects = t.subject.split(', ').map(s => s.trim()).filter(Boolean);
          
          // 🔥 LOGIC MÔN CHÍNH: Nếu có > 1 môn, lọc bỏ HĐTN/Phụ. Nếu chỉ có 1 môn, giữ nguyên.
          let finalSubject = subjects.join(', ');
          if (subjects.length > 1) {
            const proSubs = subjects.filter(s => isProfessionalSubject(s));
            if (proSubs.length > 0) finalSubject = proSubs.join(', ');
          }

          let finalGroup = t.group;
          if (finalGroup === 'Chung') {
            const inferred = inferDepartmentFromSubject(finalSubject);
            if (inferred) finalGroup = inferred;
          }

          if (mergedTeachersMap.has(mappedName)) {
            const existing = mergedTeachersMap.get(mappedName)!;
            const combined = new Set([...existing.subject.split(', '), ...finalSubject.split(', ')]);
            existing.subject = Array.from(combined).filter(Boolean).join(', ');
            if (existing.group === 'Chung' && finalGroup !== 'Chung') existing.group = finalGroup;
          } else {
            mergedTeachersMap.set(mappedName, { ...t, id: generateFixedId(mappedName), name: mappedName, subject: finalSubject, group: finalGroup });
          }
        });

        resolve({ schedules: finalSchedules, teachers: Array.from(mergedTeachersMap.values()) });
      } catch (error) { reject(error); }
    };
    reader.readAsArrayBuffer(file);
  });
};

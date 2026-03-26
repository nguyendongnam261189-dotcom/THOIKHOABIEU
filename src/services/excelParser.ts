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

const inferDepartmentFromSubject = (subject: string): string | null => {
  if (!subject) return null;
  const s = subject.toUpperCase();
  if (s.includes('TOÁN') || s.includes('TIN')) return 'Toán - Tin';
  if (s.includes('VĂN') || s.includes('GDCD')) return 'Văn - GDCD';
  if (s.includes('ANH') || s.includes('AVĂN')) return 'Ngoại ngữ';
  if (s.includes('KHTN') || s.includes('HÓA') || s.includes('LÝ') || s.includes('SINH') || s.includes('CÔNG NGHỆ') || s.includes('CNGHỆ')) return 'KHTN và Công nghệ';
  if (s.includes('SỬ') || s.includes('ĐỊA') || s.includes('NDGDĐP') || s.includes('NDGĐP') || s.includes('LỊCH SỬ') || s.includes('ĐỊA LÝ')) return 'Sử - Địa';
  if (s.includes('GDTC') || s.includes('THỂ DỤC') || s.includes('NGHỆ THUẬT') || s.includes('ÂM NHẠC') || s.includes('MỸ THUẬT')) return 'Nghệ thuật - Thể chất';
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
                if (department === 'Chung') return; 
                
                const worksheet = workbook.Sheets[sheetName];
                const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[];
                
                for (let i = 0; i < Math.min(15, jsonData.length); i++) {
                    const row = jsonData[i] || [];
                    const rowStr = row.map((c: any) => String(c).toLowerCase()).join('');
                    if (rowStr.includes('thứ') || rowStr.includes('thu') || rowStr.includes('tiết') || rowStr.includes('tiet')) {
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

        const knownSubjects = new Set<string>();
        const pcgdSheetName = workbook.SheetNames.find(name => name.toUpperCase().includes('PCGD') || name.toUpperCase().includes('PHÂN CÔNG'));
        
        const pcgdTeachers: { fullName: string, uniqueName: string, classes: Set<string>, pccmStr: string }[] = [];
        
        if (pcgdSheetName) {
          const worksheet = workbook.Sheets[pcgdSheetName];
          const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[];
          let fullNameColIdx = -1, pccmColIdx = -1, cnColIdx = -1, headerRowIdx = -1;
          
          for (let i = 0; i < Math.min(15, jsonData.length); i++) {
            const row = jsonData[i] || [];
            for (let c = 0; c < row.length; c++) {
              const cellStr = cleanString(row[c]).toLowerCase();
              if (cellStr === 'họ và tên' || cellStr === 'họ tên' || cellStr === 'giáo viên' || cellStr === 'tên gv') fullNameColIdx = c;
              if (cellStr.includes('phân công chuyên môn') || cellStr.includes('chuyên môn') || cellStr.includes('môn dạy')) pccmColIdx = c;
              if (cellStr === 'cn' || cellStr === 'chủ nhiệm' || cellStr === 'lớp cn' || cellStr === 'gvcn') cnColIdx = c;
            }
            if (fullNameColIdx !== -1) { headerRowIdx = i; break; }
          }

          if (fullNameColIdx !== -1) {
            for (let i = headerRowIdx + 1; i < jsonData.length; i++) {
              const row = jsonData[i] || [];
              const fullName = cleanString(row[fullNameColIdx]);
              if (!fullName || fullName.length < 4) continue;
              
              const pccmStr = pccmColIdx !== -1 ? cleanString(row[pccmColIdx]) : '';
              const cnStr = cnColIdx !== -1 ? cleanString(row[cnColIdx]) : '';
              const combinedStr = pccmStr + ' ' + cnStr;
              const classMatches = combinedStr.match(/\d{1,2}\s*[./]\s*\d{1,2}/g) || [];
              const pcgdClasses = new Set(classMatches.map(c => formatClassName(c)));
              
              pcgdTeachers.push({ 
                fullName, 
                uniqueName: fullName, 
                classes: pcgdClasses, 
                pccmStr: pccmStr.toUpperCase() 
              });
              
              if (pccmStr) {
                const lines = pccmStr.split('\n');
                lines.forEach(line => {
                  const parts = line.split('+').map(s => s.trim());
                  parts.forEach(part => {
                    const subject = part.replace(/\s*\(.*?\)\s*/g, '').trim();
                    if (subject) knownSubjects.add(subject);
                  });
                });
              }
            }
          }
        }

        // Xử lý trùng tên trong PCGD: Gắn môn vào tên nếu trùng
        const nameCounts = new Map<string, number>();
        pcgdTeachers.forEach(t => nameCounts.set(t.fullName, (nameCounts.get(t.fullName) || 0) + 1));
        pcgdTeachers.forEach(t => {
            if (nameCounts.get(t.fullName)! > 1) {
                const subjMatch = t.pccmStr.match(/^[A-ZĐÁÀẢÃẠĂẮẰẲẴẶÂẤẦẨẪẬÉÈẺẼẸÊẾỀỂỄỆÍÌỈĨỊÓÒỎÕỌÔỐỒỔỖỘƠỚỜỞỠỢÚÙỦŨỤƯỨỪỬỮỰÝỲỶỸỴ]+/i);
                t.uniqueName = `${t.fullName} (${subjMatch ? subjMatch[0].trim() : 'GV'})`;
            }
        });

        ['Toán', 'Văn', 'Anh', 'AVăn', 'Lý', 'Hóa', 'Sinh', 'Sử', 'Địa', 'GDCD', 'Tin', 'CNghệ', 'Công nghệ', 'GDTC', 'Thể dục', 'Nghệ thuật', 'Âm nhạc', 'Mỹ thuật', 'KHTN', 'Lịch sử', 'Địa lý', 'HĐTNHN', 'CC-HĐTNHN', 'SHL', 'Chào cờ'].forEach(s => knownSubjects.add(s));
        const sortedKnownSubjects = Array.from(knownSubjects).sort((a, b) => b.length - a.length);

        workbook.SheetNames.forEach(sheetName => {
          if (sheetName.toUpperCase().includes('PCGD') || sheetName.toUpperCase().includes('PHONGHOC') || sheetName.toUpperCase().includes('PHÂN CÔNG')) return;

          const worksheet = workbook.Sheets[sheetName];
          const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[];
          if (jsonData.length === 0) return;

          let globalBuoi: 'Sáng' | 'Chiều' = (sheetName.endsWith('_C') || sheetName.includes('_C_')) ? 'Chiều' : 'Sáng';
          let headerRowIdx = -1, thuColIdx = -1, tietColIdx = -1;

          for (let i = 0; i < Math.min(15, jsonData.length); i++) {
            const row = jsonData[i] || [];
            let fThu = -1, fTiet = -1;
            for (let c = 0; c < Math.min(5, row.length); c++) {
              const cellStr = cleanString(row[c]).toLowerCase();
              if ((cellStr.includes('thứ') || cellStr.includes('thu')) && fThu === -1) fThu = c;
              if ((cellStr.includes('tiết') || cellStr.includes('tiet')) && fTiet === -1) fTiet = c;
            }
            if (fThu !== -1 && fTiet !== -1) { headerRowIdx = i; thuColIdx = fThu; tietColIdx = fTiet; break; }
          }

          if (headerRowIdx !== -1) {
            const headerRow1 = jsonData[headerRowIdx] || [];
            const headerRow2 = jsonData[headerRowIdx + 1] || [];
            const colMap: { [key: number]: { headerName: string, buoi: 'Sáng' | 'Chiều', homeroomTeacher?: string } } = {};
            let currentHeader = '', currentHomeroomTeacher = '';

            for (let c = 0; c < Math.max(headerRow1.length, headerRow2.length); c++) {
              const val1 = cleanString(headerRow1[c]);
              const val2 = cleanString(headerRow2[c]);
              if (c === thuColIdx || c === tietColIdx) continue;
              if (val1 && val1.toLowerCase() !== 'sáng' && val1.toLowerCase() !== 'chiều') {
                currentHeader = val1.replace(/\s*\(.*\)/, '').trim(); 
                const match = val1.match(/\((.*?)\)/);
                currentHomeroomTeacher = match ? match[1].trim() : '';
              }
              if (currentHeader) {
                let colBuoi = globalBuoi;
                if (val1.toLowerCase() === 'sáng' || val2.toLowerCase() === 'sáng') colBuoi = 'Sáng';
                if (val1.toLowerCase() === 'chiều' || val2.toLowerCase() === 'chiều') colBuoi = 'Chiều';
                colMap[c] = { headerName: currentHeader, buoi: colBuoi, homeroomTeacher: currentHomeroomTeacher };
              }
            }

            let currentThu = 2;
            for (let i = headerRowIdx + 1; i < jsonData.length; i++) {
              const row = jsonData[i] || [];
              let rowThuStr = cleanString(row[thuColIdx]);
              if (rowThuStr) {
                const thuMatch = rowThuStr.toLowerCase().match(/\d+/);
                if (thuMatch) currentThu = parseInt(thuMatch[0]);
              }
              let currentTiet = parseInt(cleanString(row[tietColIdx]));
              if (!isNaN(currentTiet)) {
                for (let c = 0; c < row.length; c++) {
                  if (colMap[c]) {
                    const cellData = cleanString(row[c]);
                    if (cellData) {
                      let mon = '', secondary = ''; 
                      const cleanCellData = cellData.replace(/\r/g, '').trim();
                      let matchedSubject = sortedKnownSubjects.find(s => cleanCellData.toUpperCase().startsWith(s.toUpperCase()));
                      if (matchedSubject) {
                        mon = matchedSubject;
                        secondary = cleanCellData.substring(matchedSubject.length).replace(/^[-\n\s]+/, '').trim();
                      }

                      let lopRaw = sheetName.includes('LOP') ? colMap[c].headerName : (secondary || 'Chưa xếp');
                      let giaoVienRaw = sheetName.includes('LOP') ? (secondary || colMap[c].homeroomTeacher || 'Chưa xếp') : colMap[c].headerName;

                      const scheduleObj: Schedule = {
                        thu: currentThu,
                        tiet: currentTiet > 5 ? currentTiet - 5 : currentTiet,
                        lop: lopRaw, 
                        mon: mon,
                        giao_vien: giaoVienRaw,
                        phong: '',
                        buoi: currentTiet > 5 ? 'Chiều' : colMap[c].buoi
                      };

                      const key = `${scheduleObj.thu}-${scheduleObj.buoi}-${scheduleObj.tiet}-${scheduleObj.giao_vien}-${scheduleObj.mon}`;
                      if (uniqueSchedules.has(key)) {
                        const existing = uniqueSchedules.get(key)!;
                        if (!existing.lop.split(',').map(l => l.trim()).includes(lopRaw)) {
                          existing.lop = `${existing.lop}, ${lopRaw}`;
                        }
                      } else {
                        uniqueSchedules.set(key, scheduleObj);
                      }

                      if (!allTeachersMap.has(giaoVienRaw)) {
                        allTeachersMap.set(giaoVienRaw, {
                          name: giaoVienRaw,
                          subject: mon,
                          group: teacherDepartmentDict.get(giaoVienRaw) || 'Chung'
                        });
                      }
                    }
                  }
                }
              }
            }
          }
        });

        // ĐỒNG BỘ TÊN VÀ XỬ LÝ TRÙNG TÊN CHI TIẾT
        const shortToFullName = new Map<string, string>();
        const tkbTeacherData = new Map<string, { classes: Set<string> }>();
        uniqueSchedules.forEach(s => {
            if (!tkbTeacherData.has(s.giao_vien)) tkbTeacherData.set(s.giao_vien, { classes: new Set() });
            s.lop.split(',').forEach(c => {
                const cleanC = formatClassName(c); 
                if (cleanC && cleanC !== 'CHƯAXẾP') tkbTeacherData.get(s.giao_vien)!.classes.add(cleanC);
            });
        });

        allTeachersMap.forEach((teacher, shortName) => {
            const tkbClasses = tkbTeacherData.get(shortName)?.classes || new Set();
            let bestMatch = null, maxScore = -1;
            
            pcgdTeachers.forEach(cand => {
                let score = 0;
                tkbClasses.forEach(c => { if (cand.classes.has(c)) score += 1000; });
                const candUpper = cand.fullName.toUpperCase();
                const shortUpper = shortName.toUpperCase();
                if (candUpper === shortUpper) score += 500;
                else if (candUpper.includes(shortUpper)) score += 100;
                
                if (score > maxScore) { maxScore = score; bestMatch = cand; }
            });

            if (bestMatch && maxScore >= 50) shortToFullName.set(shortName, bestMatch.uniqueName);
            else shortToFullName.set(shortName, shortName);
        });

        const finalSchedules = Array.from(uniqueSchedules.values()).map(s => ({
            ...s,
            giao_vien: shortToFullName.get(s.giao_vien) || s.giao_vien,
            lop: s.lop.split(',').map(item => formatClassName(item)).join(', ')
        }));

        const mergedTeachersMap = new Map<string, Teacher>();
        allTeachersMap.forEach((t, sName) => {
            const mappedName = shortToFullName.get(sName) || sName;
            let finalGroup = t.group;
            if (finalGroup === 'Chung') finalGroup = inferDepartmentFromSubject(t.subject) || 'Chung';

            if (mergedTeachersMap.has(mappedName)) {
                const existing = mergedTeachersMap.get(mappedName)!;
                const subs = new Set([...existing.subject.split(', '), t.subject]);
                existing.subject = Array.from(subs).filter(Boolean).join(', ');
                if (existing.group === 'Chung') existing.group = finalGroup;
            } else {
                mergedTeachersMap.set(mappedName, { ...t, name: mappedName, group: finalGroup });
            }
        });

        resolve({ schedules: finalSchedules, teachers: Array.from(mergedTeachersMap.values()) });
      } catch (error) { reject(error); }
    };
    reader.readAsArrayBuffer(file);
  });
};

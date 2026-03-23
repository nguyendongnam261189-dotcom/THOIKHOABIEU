import * as XLSX from 'xlsx';
import { Schedule, Teacher } from '../types';

const getDepartmentFromSheetName = (sheetName: string): string => {
  const name = sheetName.toUpperCase();
  if (name.includes('_NN')) return 'Ngoại ngữ';
  if (name.includes('_KHTN')) return 'Khoa học tự nhiên';
  if (name.includes('_SĐ') || name.includes('_SD')) return 'Sử - Địa';
  if (name.includes('_T_') || name.endsWith('_T')) return 'Toán - Tin';
  if (name.includes('_TM')) return 'Nghệ thuật - Thể chất';
  if (name.includes('_V_') || name.endsWith('_V')) return 'Văn - GDCD';
  if (name.includes('_CN_') || name.endsWith('_CN')) return 'Công nghệ';import * as XLSX from 'xlsx';
import { Schedule, Teacher } from '../types';

const getDepartmentFromSheetName = (sheetName: string): string => {
  const name = sheetName.toUpperCase();
  if (name.includes('_NN')) return 'Ngoại ngữ';
  // Đã gộp KHTN và Công nghệ thành 1 tổ
  if (name.includes('_KHTN') || name.includes('_CN_') || name.endsWith('_CN')) return 'KHTN và Công nghệ';
  if (name.includes('_SĐ') || name.includes('_SD')) return 'Sử - Địa';
  if (name.includes('_T_') || name.endsWith('_T')) return 'Toán - Tin';
  if (name.includes('_TM')) return 'Nghệ thuật - Thể chất';
  if (name.includes('_V_') || name.endsWith('_V')) return 'Văn - GDCD';
  return 'Chung';
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
        
        // Pass 1: Extract known subjects from PCGD sheet if it exists
        const knownSubjects = new Set<string>();
        const pcgdSheetName = workbook.SheetNames.find(name => name.includes('PCGD'));
        if (pcgdSheetName) {
          const worksheet = workbook.Sheets[pcgdSheetName];
          const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[];
          
          let pccmColIdx = -1;
          let headerRowIdx = -1;
          
          for (let i = 0; i < Math.min(10, jsonData.length); i++) {
            const row = jsonData[i] || [];
            for (let c = 0; c < row.length; c++) {
              const cellStr = String(row[c] || '').trim().toLowerCase();
              if (cellStr.includes('phân công chuyên môn') || cellStr.includes('phan cong chuyen mon')) {
                pccmColIdx = c;
                headerRowIdx = i;
                break;
              }
            }
            if (pccmColIdx !== -1) break;
          }
          
          if (pccmColIdx !== -1) {
            for (let i = headerRowIdx + 1; i < jsonData.length; i++) {
              const row = jsonData[i] || [];
              const cellData = String(row[pccmColIdx] || '').trim();
              if (cellData) {
                const lines = cellData.split('\n');
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
        
        // Add some common subjects just in case they are not in PCGD or slightly different
        ['Toán', 'Văn', 'Anh', 'AVăn', 'Lý', 'Hóa', 'Sinh', 'Sử', 'Địa', 'GDCD', 'Tin', 'CNghệ', 'Công nghệ', 'GDTC', 'Thể dục', 'Nghệ thuật', 'Âm nhạc', 'Mỹ thuật', 'KHTN', 'Lịch sử', 'Địa lý', 'HĐTNHN', 'CC-HĐTNHN', 'SHL', 'Chào cờ'].forEach(s => knownSubjects.add(s));
        
        const sortedKnownSubjects = Array.from(knownSubjects).sort((a, b) => b.length - a.length);

        workbook.SheetNames.forEach(sheetName => {
          // Skip PCGD and PHONGHOC sheets to avoid parsing irrelevant data
          if (sheetName.includes('PCGD') || sheetName.includes('PHONGHOC') || sheetName.includes('PhongHoc')) {
             return;
          }

          const worksheet = workbook.Sheets[sheetName];
          const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[];

          if (jsonData.length === 0) return;

          // Determine global session (Sáng/Chiều) for this sheet
          let globalBuoi: 'Sáng' | 'Chiều' = 'Sáng';
          const sheetText = JSON.stringify(jsonData).toLowerCase();
          if (sheetText.includes('buổi chiều') || sheetName.endsWith('_C') || sheetName.includes('_C_')) {
            globalBuoi = 'Chiều';
          }

          // Find the header row
          let headerRowIdx = -1;
          let thuColIdx = -1;
          let tietColIdx = -1;

          for (let i = 0; i < Math.min(15, jsonData.length); i++) {
            const row = jsonData[i] || [];
            let foundThu = -1;
            let foundTiet = -1;
            for (let c = 0; c < Math.min(5, row.length); c++) {
              const cellStr = String(row[c] || '').trim().toLowerCase();
              if ((cellStr === 'thứ' || cellStr === 'thu') && foundThu === -1) foundThu = c;
              if ((cellStr === 'tiết' || cellStr === 'tiet') && foundTiet === -1) foundTiet = c;
            }
            if (foundThu !== -1 && foundTiet !== -1) {
              headerRowIdx = i;
              thuColIdx = foundThu;
              tietColIdx = foundTiet;
              break;
            }
          }

          if (headerRowIdx === -1) {
            // Fallback: look for includes if exact match fails
            for (let i = 0; i < Math.min(15, jsonData.length); i++) {
              const row = jsonData[i] || [];
              let foundThu = -1;
              let foundTiet = -1;
              for (let c = 0; c < Math.min(5, row.length); c++) {
                const cellStr = String(row[c] || '').trim().toLowerCase();
                if ((cellStr.includes('thứ') || cellStr.includes('thu')) && foundThu === -1) foundThu = c;
                if ((cellStr.includes('tiết') || cellStr.includes('tiet')) && foundTiet === -1) foundTiet = c;
              }
              if (foundThu !== -1 && foundTiet !== -1) {
                headerRowIdx = i;
                thuColIdx = foundThu;
                tietColIdx = foundTiet;
                break;
              }
            }
          }

          if (headerRowIdx === -1) {
            for (let i = 0; i < Math.min(15, jsonData.length); i++) {
              const row = jsonData[i] || [];
              const validCells = row.filter((c: any) => String(c).trim().length > 0);
              if (validCells.length > 4) {
                headerRowIdx = i;
                break;
              }
            }
          }

          if (headerRowIdx !== -1) {
            const headerRow1 = jsonData[headerRowIdx] || [];
            const headerRow2 = jsonData[headerRowIdx + 1] || [];

            if (thuColIdx === -1) thuColIdx = 0;
            if (tietColIdx === -1) tietColIdx = 1;

            // Detect if it's a Class sheet or Teacher sheet
            let classHeaderCount = 0;
            for (let c = 0; c < headerRow1.length; c++) {
              const val = String(headerRow1[c]).trim();
              if (/^\d{1,2}\.?\/?\d{1,2}/.test(val)) {
                classHeaderCount++;
              }
            }
            const isClassSheet = classHeaderCount >= 2 || sheetName.includes('LOP');

            // Build column map
            const colMap: { [key: number]: { headerName: string, buoi: 'Sáng' | 'Chiều', homeroomTeacher?: string } } = {};
            let currentHeader = '';
            let currentHomeroomTeacher = '';

            for (let c = 0; c < Math.max(headerRow1.length, headerRow2.length); c++) {
              const val1 = String(headerRow1[c] || '').trim();
              const val2 = String(headerRow2[c] || '').trim();

              if (c === thuColIdx || c === tietColIdx) continue;

              let isBuoiVal1 = val1.toLowerCase() === 'sáng' || val1.toLowerCase() === 'chiều';
              
              if (val1 && !isBuoiVal1) {
                if (isClassSheet) {
                  currentHeader = val1.replace(/\s*\(.*\)/, '').trim(); // Remove teacher name in parenthesis for class
                  const match = val1.match(/\((.*?)\)/);
                  if (match) {
                    currentHomeroomTeacher = match[1].trim();
                  } else {
                    currentHomeroomTeacher = '';
                  }
                } else {
                  currentHeader = val1; // Keep teacher name as is
                  currentHomeroomTeacher = '';
                }
              }

              if (currentHeader) {
                let colBuoi = globalBuoi;
                if (val1.toLowerCase() === 'sáng' || val2.toLowerCase() === 'sáng') colBuoi = 'Sáng';
                if (val1.toLowerCase() === 'chiều' || val2.toLowerCase() === 'chiều') colBuoi = 'Chiều';
                
                colMap[c] = { headerName: currentHeader, buoi: colBuoi, homeroomTeacher: currentHomeroomTeacher };
              }
            }

            let currentThu = 2;
            let currentBuoiRow = globalBuoi;
            
            for (let i = headerRowIdx + 1; i < jsonData.length; i++) {
              const row = jsonData[i] || [];
              if (row.length === 0) continue;

              let rowThuStr = String(row[thuColIdx] || '').trim();
              let rowTietStr = String(row[tietColIdx] || '').trim();

              if (rowThuStr) {
                let parsedThu = -1;
                const lowerThu = rowThuStr.toLowerCase();
                
                if (lowerThu.includes('thứ') || lowerThu.includes('thu') || /^t\d/.test(lowerThu)) {
                  const thuMatch = lowerThu.match(/\d+/);
                  if (thuMatch) {
                    parsedThu = parseInt(thuMatch[0]);
                  } else if (lowerThu.includes('hai')) parsedThu = 2;
                  else if (lowerThu.includes('ba')) parsedThu = 3;
                  else if (lowerThu.includes('tư') || lowerThu.includes('tu')) parsedThu = 4;
                  else if (lowerThu.includes('năm') || lowerThu.includes('nam')) parsedThu = 5;
                  else if (lowerThu.includes('sáu') || lowerThu.includes('sau')) parsedThu = 6;
                  else if (lowerThu.includes('bảy') || lowerThu.includes('bay')) parsedThu = 7;
                } else {
                  const thuMatch = lowerThu.match(/^\s*0?[2-7]\s*$/);
                  if (thuMatch) {
                    parsedThu = parseInt(thuMatch[0]);
                  }
                }
                
                if (parsedThu >= 2 && parsedThu <= 7) {
                  currentThu = parsedThu;
                }
                
                if (lowerThu.includes('sáng')) currentBuoiRow = 'Sáng';
                if (lowerThu.includes('chiều')) currentBuoiRow = 'Chiều';
              }

              let currentTiet = parseInt(rowTietStr);

              if (!isNaN(currentTiet) && currentTiet >= 1 && currentTiet <= 15) {
                for (let c = 0; c < row.length; c++) {
                  if (colMap[c]) {
                    const cellData = String(row[c] || '').trim();
                    if (cellData && cellData !== '') {
                      
                      // LOGIC BÓC TÁCH DỮ LIỆU ĐÃ ĐƯỢC LÀM MỚI 100%
                      let mon = '';
                      let secondary = ''; 
                      const cleanCellData = cellData.replace(/\r/g, '').trim();

                      // 1. Cố gắng tìm Môn học ở ĐẦU chuỗi
                      let matchedSubject = sortedKnownSubjects.find(s => {
                        if (cleanCellData.toUpperCase().startsWith(s.toUpperCase())) {
                          const remaining = cleanCellData.substring(s.length).trim();
                          return remaining === '' || remaining.startsWith('-') || remaining.startsWith('\n');
                        }
                        return false;
                      });

                      if (matchedSubject) {
                        mon = matchedSubject;
                        secondary = cleanCellData.substring(matchedSubject.length).replace(/^[-\n\s]+/, '').trim();
                      } 
                      // 2. Cố gắng tìm Môn học ở CUỐI chuỗi
                      else {
                        matchedSubject = sortedKnownSubjects.find(s => {
                          if (cleanCellData.toUpperCase().endsWith(s.toUpperCase())) {
                            const before = cleanCellData.substring(0, cleanCellData.length - s.length).trim();
                            return before === '' || before.endsWith('-') || before.endsWith('\n');
                          }
                          return false;
                        });
                        
                        if (matchedSubject) {
                          mon = matchedSubject;
                          secondary = cleanCellData.substring(0, cleanCellData.length - matchedSubject.length).replace(/[-\n\s]+$/, '').trim();
                        }
                      }

                      // 3. Nếu vẫn không thấy, tách thủ công
                      if (!mon) {
                        if (cleanCellData.includes('-')) {
                          const parts = cleanCellData.split('-');
                          if (isClassSheet) {
                            mon = parts[0].trim();
                            secondary = parts[1].trim();
                          } else {
                            secondary = parts[0].trim();
                            mon = parts[1].trim();
                          }
                        } else if (cleanCellData.includes('\n')) {
                          const parts = cleanCellData.split('\n');
                          if (isClassSheet) {
                            mon = parts[0].trim();
                            secondary = parts[parts.length - 1].trim();
                          } else {
                            secondary = parts[0].trim();
                            mon = parts[parts.length - 1].trim();
                          }
                        } else {
                          if (isClassSheet) {
                            mon = cleanCellData;
                            secondary = '';
                          } else {
                            secondary = cleanCellData;
                            mon = '';
                          }
                        }
                      }

                      let lop = '';
                      let giao_vien = '';

                      if (isClassSheet) {
                        lop = colMap[c].headerName;
                        giao_vien = secondary || colMap[c].homeroomTeacher || 'Chưa xếp';
                      } else {
                        giao_vien = colMap[c].headerName;
                        lop = secondary || 'Chưa xếp';
                        if (!mon) mon = 'Theo phân công'; 
                      }

                      if (lop && giao_vien && giao_vien !== 'Chưa xếp' && lop !== 'Chưa xếp') {
                        // Determine Buoi: if column has specific Buoi, use it, else use row's Buoi
                        let finalBuoi = colMap[c].buoi;
                        if (sheetName.includes('_SC') && (rowThuStr.toLowerCase().includes('sáng') || rowThuStr.toLowerCase().includes('chiều'))) {
                           finalBuoi = currentBuoiRow;
                        }

                        // Normalize tiet: if it's > 5, it's likely an afternoon period (6-10). Convert to 1-5.
                        let normalizedTiet = currentTiet;
                        if (normalizedTiet > 5) {
                          normalizedTiet -= 5;
                          finalBuoi = 'Chiều'; // Force buoi to Chiều if tiet > 5
                        }

                        const scheduleObj: Schedule = {
                          thu: currentThu,
                          tiet: normalizedTiet,
                          lop: lop,
                          mon: mon,
                          giao_vien: giao_vien,
                          phong: '',
                          buoi: finalBuoi
                        };

                        // Use a unique key to deduplicate identical schedules across different sheets
                        const key = `${currentThu}-${finalBuoi}-${normalizedTiet}-${giao_vien}-${mon}`;
                        const existingSchedule = uniqueSchedules.get(key);
                        
                        if (existingSchedule) {
                          // If the same teacher teaches the same subject at the same time, it's a combined class
                          if (!existingSchedule.lop.split(', ').includes(lop)) {
                            existingSchedule.lop += `, ${lop}`;
                          }
                        } else {
                           uniqueSchedules.set(key, scheduleObj);
                        }

                        const department = getDepartmentFromSheetName(sheetName);
                        const existingTeacher = allTeachersMap.get(giao_vien);
                        if (!existingTeacher) {
                          allTeachersMap.set(giao_vien, {
                            name: giao_vien,
                            subject: mon !== 'Theo phân công' ? mon : '',
                            group: department
                          });
                        } else {
                          // Nếu giáo viên bị xếp nhầm vào tổ Chung trước đó, cập nhật lại đúng tổ
                          if (existingTeacher.group === 'Chung' && department !== 'Chung') {
                            existingTeacher.group = department;
                          }
                          
                          if (mon && mon !== 'Theo phân công') {
                            const subjects = existingTeacher.subject ? existingTeacher.subject.split(', ').map(s => s.trim()) : [];
                            if (!subjects.includes(mon)) {
                              existingTeacher.subject = existingTeacher.subject ? `${existingTeacher.subject}, ${mon}` : mon;
                            }
                          }
                        }
                      }
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
      } catch (error) {
        reject(error);
      }
    };

    reader.onerror = (error) => reject(error);
    reader.readAsArrayBuffer(file);
  });
};
  return 'Chung';
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
        
        // Pass 1: Extract known subjects from PCGD sheet if it exists
        const knownSubjects = new Set<string>();
        const pcgdSheetName = workbook.SheetNames.find(name => name.includes('PCGD'));
        if (pcgdSheetName) {
          const worksheet = workbook.Sheets[pcgdSheetName];
          const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[];
          
          let pccmColIdx = -1;
          let headerRowIdx = -1;
          
          for (let i = 0; i < Math.min(10, jsonData.length); i++) {
            const row = jsonData[i] || [];
            for (let c = 0; c < row.length; c++) {
              const cellStr = String(row[c] || '').trim().toLowerCase();
              if (cellStr.includes('phân công chuyên môn') || cellStr.includes('phan cong chuyen mon')) {
                pccmColIdx = c;
                headerRowIdx = i;
                break;
              }
            }
            if (pccmColIdx !== -1) break;
          }
          
          if (pccmColIdx !== -1) {
            for (let i = headerRowIdx + 1; i < jsonData.length; i++) {
              const row = jsonData[i] || [];
              const cellData = String(row[pccmColIdx] || '').trim();
              if (cellData) {
                const lines = cellData.split('\n');
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
        
        // Add some common subjects just in case they are not in PCGD or slightly different
        ['Toán', 'Văn', 'Anh', 'AVăn', 'Lý', 'Hóa', 'Sinh', 'Sử', 'Địa', 'GDCD', 'Tin', 'CNghệ', 'Công nghệ', 'GDTC', 'Thể dục', 'Nghệ thuật', 'Âm nhạc', 'Mỹ thuật', 'KHTN', 'Lịch sử', 'Địa lý', 'HĐTNHN', 'CC-HĐTNHN', 'SHL', 'Chào cờ'].forEach(s => knownSubjects.add(s));
        
        const sortedKnownSubjects = Array.from(knownSubjects).sort((a, b) => b.length - a.length);

        workbook.SheetNames.forEach(sheetName => {
          // Skip PCGD and PHONGHOC sheets to avoid parsing irrelevant data
          if (sheetName.includes('PCGD') || sheetName.includes('PHONGHOC') || sheetName.includes('PhongHoc')) {
             return;
          }

          const worksheet = workbook.Sheets[sheetName];
          const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[];

          if (jsonData.length === 0) return;

          // Determine global session (Sáng/Chiều) for this sheet
          let globalBuoi: 'Sáng' | 'Chiều' = 'Sáng';
          const sheetText = JSON.stringify(jsonData).toLowerCase();
          if (sheetText.includes('buổi chiều') || sheetName.endsWith('_C') || sheetName.includes('_C_')) {
            globalBuoi = 'Chiều';
          }

          // Find the header row
          let headerRowIdx = -1;
          let thuColIdx = -1;
          let tietColIdx = -1;

          for (let i = 0; i < Math.min(15, jsonData.length); i++) {
            const row = jsonData[i] || [];
            let foundThu = -1;
            let foundTiet = -1;
            for (let c = 0; c < Math.min(5, row.length); c++) {
              const cellStr = String(row[c] || '').trim().toLowerCase();
              if ((cellStr === 'thứ' || cellStr === 'thu') && foundThu === -1) foundThu = c;
              if ((cellStr === 'tiết' || cellStr === 'tiet') && foundTiet === -1) foundTiet = c;
            }
            if (foundThu !== -1 && foundTiet !== -1) {
              headerRowIdx = i;
              thuColIdx = foundThu;
              tietColIdx = foundTiet;
              break;
            }
          }

          if (headerRowIdx === -1) {
            // Fallback: look for includes if exact match fails
            for (let i = 0; i < Math.min(15, jsonData.length); i++) {
              const row = jsonData[i] || [];
              let foundThu = -1;
              let foundTiet = -1;
              for (let c = 0; c < Math.min(5, row.length); c++) {
                const cellStr = String(row[c] || '').trim().toLowerCase();
                if ((cellStr.includes('thứ') || cellStr.includes('thu')) && foundThu === -1) foundThu = c;
                if ((cellStr.includes('tiết') || cellStr.includes('tiet')) && foundTiet === -1) foundTiet = c;
              }
              if (foundThu !== -1 && foundTiet !== -1) {
                headerRowIdx = i;
                thuColIdx = foundThu;
                tietColIdx = foundTiet;
                break;
              }
            }
          }

          if (headerRowIdx === -1) {
            for (let i = 0; i < Math.min(15, jsonData.length); i++) {
              const row = jsonData[i] || [];
              const validCells = row.filter((c: any) => String(c).trim().length > 0);
              if (validCells.length > 4) {
                headerRowIdx = i;
                break;
              }
            }
          }

          if (headerRowIdx !== -1) {
            const headerRow1 = jsonData[headerRowIdx] || [];
            const headerRow2 = jsonData[headerRowIdx + 1] || [];

            if (thuColIdx === -1) thuColIdx = 0;
            if (tietColIdx === -1) tietColIdx = 1;

            // Detect if it's a Class sheet or Teacher sheet
            let classHeaderCount = 0;
            for (let c = 0; c < headerRow1.length; c++) {
              const val = String(headerRow1[c]).trim();
              if (/^\d{1,2}\.?\/?\d{1,2}/.test(val)) {
                classHeaderCount++;
              }
            }
            const isClassSheet = classHeaderCount >= 2 || sheetName.includes('LOP');

            // Build column map
            const colMap: { [key: number]: { headerName: string, buoi: 'Sáng' | 'Chiều', homeroomTeacher?: string } } = {};
            let currentHeader = '';
            let currentHomeroomTeacher = '';

            for (let c = 0; c < Math.max(headerRow1.length, headerRow2.length); c++) {
              const val1 = String(headerRow1[c] || '').trim();
              const val2 = String(headerRow2[c] || '').trim();

              if (c === thuColIdx || c === tietColIdx) continue;

              let isBuoiVal1 = val1.toLowerCase() === 'sáng' || val1.toLowerCase() === 'chiều';
              
              if (val1 && !isBuoiVal1) {
                if (isClassSheet) {
                  currentHeader = val1.replace(/\s*\(.*\)/, '').trim(); // Remove teacher name in parenthesis for class
                  const match = val1.match(/\((.*?)\)/);
                  if (match) {
                    currentHomeroomTeacher = match[1].trim();
                  } else {
                    currentHomeroomTeacher = '';
                  }
                } else {
                  currentHeader = val1; // Keep teacher name as is
                  currentHomeroomTeacher = '';
                }
              }

              if (currentHeader) {
                let colBuoi = globalBuoi;
                if (val1.toLowerCase() === 'sáng' || val2.toLowerCase() === 'sáng') colBuoi = 'Sáng';
                if (val1.toLowerCase() === 'chiều' || val2.toLowerCase() === 'chiều') colBuoi = 'Chiều';
                
                colMap[c] = { headerName: currentHeader, buoi: colBuoi, homeroomTeacher: currentHomeroomTeacher };
              }
            }

            let currentThu = 2;
            let currentBuoiRow = globalBuoi;
            
            for (let i = headerRowIdx + 1; i < jsonData.length; i++) {
              const row = jsonData[i] || [];
              if (row.length === 0) continue;

              let rowThuStr = String(row[thuColIdx] || '').trim();
              let rowTietStr = String(row[tietColIdx] || '').trim();

              if (rowThuStr) {
                let parsedThu = -1;
                const lowerThu = rowThuStr.toLowerCase();
                
                if (lowerThu.includes('thứ') || lowerThu.includes('thu') || /^t\d/.test(lowerThu)) {
                  const thuMatch = lowerThu.match(/\d+/);
                  if (thuMatch) {
                    parsedThu = parseInt(thuMatch[0]);
                  } else if (lowerThu.includes('hai')) parsedThu = 2;
                  else if (lowerThu.includes('ba')) parsedThu = 3;
                  else if (lowerThu.includes('tư') || lowerThu.includes('tu')) parsedThu = 4;
                  else if (lowerThu.includes('năm') || lowerThu.includes('nam')) parsedThu = 5;
                  else if (lowerThu.includes('sáu') || lowerThu.includes('sau')) parsedThu = 6;
                  else if (lowerThu.includes('bảy') || lowerThu.includes('bay')) parsedThu = 7;
                } else {
                  const thuMatch = lowerThu.match(/^\s*0?[2-7]\s*$/);
                  if (thuMatch) {
                    parsedThu = parseInt(thuMatch[0]);
                  }
                }
                
                if (parsedThu >= 2 && parsedThu <= 7) {
                  currentThu = parsedThu;
                }
                
                if (lowerThu.includes('sáng')) currentBuoiRow = 'Sáng';
                if (lowerThu.includes('chiều')) currentBuoiRow = 'Chiều';
              }

              let currentTiet = parseInt(rowTietStr);

              if (!isNaN(currentTiet) && currentTiet >= 1 && currentTiet <= 15) {
                for (let c = 0; c < row.length; c++) {
                  if (colMap[c]) {
                    const cellData = String(row[c] || '').trim();
                    if (cellData && cellData !== '') {
                      let mon = cellData;
                      let secondary = '';

                      const matchedSubject = sortedKnownSubjects.find(s => {
                        if (cellData.startsWith(s)) {
                          const remaining = cellData.substring(s.length).trim();
                          return remaining === '' || remaining.startsWith('-');
                        }
                        return false;
                      });
                      
                      if (matchedSubject) {
                        mon = matchedSubject;
                        secondary = cellData.substring(matchedSubject.length).replace(/^\s*-\s*/, '').trim();
                      } else if (cellData.includes('-')) {
                        const lastDashIndex = cellData.lastIndexOf('-');
                        mon = cellData.substring(0, lastDashIndex).trim();
                        secondary = cellData.substring(lastDashIndex + 1).trim();
                      } else if (cellData.includes('\n')) {
                        const parts = cellData.split('\n').map(p => p.trim()).filter(p => p);
                        if (parts.length >= 2) {
                          mon = parts[0];
                          secondary = parts[parts.length - 1];
                        }
                      }

                      let lop = '';
                      let giao_vien = '';

                      if (isClassSheet) {
                        lop = colMap[c].headerName;
                        giao_vien = secondary || colMap[c].homeroomTeacher || 'Chưa xếp';
                      } else {
                        giao_vien = colMap[c].headerName;
                        lop = secondary || 'Chưa xếp';
                      }

                      if (mon && giao_vien && lop && giao_vien !== 'Chưa xếp' && lop !== 'Chưa xếp') {
                        // Determine Buoi: if column has specific Buoi, use it, else use row's Buoi
                        let finalBuoi = colMap[c].buoi;
                        if (sheetName.includes('_SC') && (rowThuStr.toLowerCase().includes('sáng') || rowThuStr.toLowerCase().includes('chiều'))) {
                           finalBuoi = currentBuoiRow;
                        }

                        // Normalize tiet: if it's > 5, it's likely an afternoon period (6-10). Convert to 1-5.
                        let normalizedTiet = currentTiet;
                        if (normalizedTiet > 5) {
                          normalizedTiet -= 5;
                          finalBuoi = 'Chiều'; // Force buoi to Chiều if tiet > 5
                        }

                        const scheduleObj: Schedule = {
                          thu: currentThu,
                          tiet: normalizedTiet,
                          lop: lop,
                          mon: mon,
                          giao_vien: giao_vien,
                          phong: '',
                          buoi: finalBuoi
                        };

                        // Use a unique key to deduplicate identical schedules across different sheets
                        // We use a combination of time, teacher, and subject to detect combined classes (lớp ghép)
                        const key = `${currentThu}-${finalBuoi}-${normalizedTiet}-${giao_vien}-${mon}`;
                        const existingSchedule = uniqueSchedules.get(key);
                        
                        if (existingSchedule) {
                          // If the same teacher teaches the same subject at the same time, it's a combined class
                          // Only append if the class is different
                          if (!existingSchedule.lop.split(', ').includes(lop)) {
                            existingSchedule.lop += `, ${lop}`;
                          }
                        } else {
                           uniqueSchedules.set(key, scheduleObj);
                        }

                        const department = getDepartmentFromSheetName(sheetName);
                        const existingTeacher = allTeachersMap.get(giao_vien);
                        if (!existingTeacher) {
                          allTeachersMap.set(giao_vien, {
                            name: giao_vien,
                            subject: mon,
                            group: department
                          });
                        } else {
                          if (existingTeacher.group === 'Chung' && department !== 'Chung') {
                            existingTeacher.group = department;
                          }
                          const subjects = existingTeacher.subject.split(', ').map(s => s.trim());
                          if (!subjects.includes(mon)) {
                            existingTeacher.subject += `, ${mon}`;
                          }
                        }
                      }
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
      } catch (error) {
        reject(error);
      }
    };

    reader.onerror = (error) => reject(error);
    reader.readAsArrayBuffer(file);
  });
};

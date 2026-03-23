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

// CƠ CHẾ MỚI: Tự động suy luận Tổ chuyên môn dựa trên Môn học đang dạy
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

        // ============================================================================
        // BƯỚC 1: XÂY DỰNG TỪ ĐIỂN TỔ CHUYÊN MÔN
        // ============================================================================
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

        // ============================================================================
        // BƯỚC 2: TÌM MÔN HỌC TỪ PCGD
        // ============================================================================
        const knownSubjects = new Set<string>();
        const pcgdSheetName = workbook.SheetNames.find(name => name.includes('PCGD') || name.toUpperCase().includes('PHÂN CÔNG'));
        
        if (pcgdSheetName) {
          const worksheet = workbook.Sheets[pcgdSheetName];
          const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[];
          
          let pccmColIdx = -1;
          let headerRowIdx = -1;
          
          for (let i = 0; i < Math.min(10, jsonData.length); i++) {
            const row = jsonData[i] || [];
            for (let c = 0; c < row.length; c++) {
              const cellStr = cleanString(row[c]).toLowerCase();
              if (cellStr.includes('phân công chuyên môn') || cellStr.includes('phan cong chuyen mon') || cellStr.includes('chuyên môn')) {
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
              const cellData = cleanString(row[pccmColIdx]);
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
        
        ['Toán', 'Văn', 'Anh', 'AVăn', 'Lý', 'Hóa', 'Sinh', 'Sử', 'Địa', 'GDCD', 'Tin', 'CNghệ', 'Công nghệ', 'GDTC', 'Thể dục', 'Nghệ thuật', 'Âm nhạc', 'Mỹ thuật', 'KHTN', 'Lịch sử', 'Địa lý', 'HĐTNHN', 'CC-HĐTNHN', 'SHL', 'Chào cờ'].forEach(s => knownSubjects.add(s));
        const sortedKnownSubjects = Array.from(knownSubjects).sort((a, b) => b.length - a.length);

        // ============================================================================
        // BƯỚC 3: QUÉT TOÀN BỘ FILE EXCEL ĐỂ ĐỌC TKB VÀ GHI NHẬN LỚP DẠY
        // ============================================================================
        workbook.SheetNames.forEach(sheetName => {
          if (sheetName.includes('PCGD') || sheetName.includes('PHONGHOC') || sheetName.includes('PhongHoc') || sheetName.toUpperCase().includes('PHÂN CÔNG')) {
             return;
          }

          const worksheet = workbook.Sheets[sheetName];
          const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[];

          if (jsonData.length === 0) return;

          let globalBuoi: 'Sáng' | 'Chiều' = 'Sáng';
          const sheetText = JSON.stringify(jsonData).toLowerCase();
          if (sheetText.includes('buổi chiều') || sheetName.endsWith('_C') || sheetName.includes('_C_')) {
            globalBuoi = 'Chiều';
          }

          let headerRowIdx = -1;
          let thuColIdx = -1;
          let tietColIdx = -1;

          for (let i = 0; i < Math.min(15, jsonData.length); i++) {
            const row = jsonData[i] || [];
            let foundThu = -1;
            let foundTiet = -1;
            for (let c = 0; c < Math.min(5, row.length); c++) {
              const cellStr = cleanString(row[c]).toLowerCase();
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
            for (let i = 0; i < Math.min(15, jsonData.length); i++) {
              const row = jsonData[i] || [];
              let foundThu = -1;
              let foundTiet = -1;
              for (let c = 0; c < Math.min(5, row.length); c++) {
                const cellStr = cleanString(row[c]).toLowerCase();
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
              const validCells = row.filter((c: any) => cleanString(c).length > 0);
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

            let classHeaderCount = 0;
            for (let c = 0; c < headerRow1.length; c++) {
              const val = cleanString(headerRow1[c]);
              if (/^\d{1,2}\.?\/?\d{1,2}/.test(val)) {
                classHeaderCount++;
              }
            }
            const isClassSheet = classHeaderCount >= 2 || sheetName.includes('LOP');

            const colMap: { [key: number]: { headerName: string, buoi: 'Sáng' | 'Chiều', homeroomTeacher?: string } } = {};
            let currentHeader = '';
            let currentHomeroomTeacher = '';

            for (let c = 0; c < Math.max(headerRow1.length, headerRow2.length); c++) {
              const val1 = cleanString(headerRow1[c]);
              const val2 = cleanString(headerRow2[c]);

              if (c === thuColIdx || c === tietColIdx) continue;

              let isBuoiVal1 = val1.toLowerCase() === 'sáng' || val1.toLowerCase() === 'chiều';
              
              if (val1 && !isBuoiVal1) {
                if (isClassSheet) {
                  currentHeader = val1.replace(/\s*\(.*\)/, '').trim(); 
                  const match = val1.match(/\((.*?)\)/);
                  if (match) {
                    currentHomeroomTeacher = match[1].trim();
                  } else {
                    currentHomeroomTeacher = '';
                  }
                } else {
                  currentHeader = val1; 
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

              let rowThuStr = cleanString(row[thuColIdx]);
              let rowTietStr = cleanString(row[tietColIdx]);

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
                    const cellData = cleanString(row[c]);
                    if (cellData && cellData !== '') {
                      
                      let mon = '';
                      let secondary = ''; 
                      const cleanCellData = cellData.replace(/\r/g, '').trim();

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
                        let finalBuoi = colMap[c].buoi;
                        if (sheetName.includes('_SC') && (rowThuStr.toLowerCase().includes('sáng') || rowThuStr.toLowerCase().includes('chiều'))) {
                           finalBuoi = currentBuoiRow;
                        }

                        let normalizedTiet = currentTiet;
                        if (normalizedTiet > 5) {
                          normalizedTiet -= 5;
                          finalBuoi = 'Chiều'; 
                        }

                        const scheduleObj: Schedule = {
                          thu: currentThu,
                          tiet: normalizedTiet,
                          lop: lop,
                          mon: mon,
                          giao_vien: giao_vien, // Sẽ chuẩn hóa ở bước sau
                          phong: '',
                          buoi: finalBuoi
                        };

                        const key = `${currentThu}-${finalBuoi}-${normalizedTiet}-${giao_vien}-${mon}`;
                        const existingSchedule = uniqueSchedules.get(key);
                        
                        if (existingSchedule) {
                          if (!existingSchedule.lop.split(', ').includes(lop)) {
                            existingSchedule.lop += `, ${lop}`;
                          }
                        } else {
                           uniqueSchedules.set(key, scheduleObj);
                        }

                        let assignedDepartment = teacherDepartmentDict.get(giao_vien) || 'Chung';

                        const existingTeacher = allTeachersMap.get(giao_vien);
                        if (!existingTeacher) {
                          if (assignedDepartment === 'Chung' && mon && mon !== 'Theo phân công') {
                            const inferred = inferDepartmentFromSubject(mon);
                            if (inferred) assignedDepartment = inferred;
                          }

                          allTeachersMap.set(giao_vien, {
                            name: giao_vien,
                            subject: mon !== 'Theo phân công' ? mon : '',
                            group: assignedDepartment
                          });
                        } else {
                          if (existingTeacher.group === 'Chung') {
                            if (assignedDepartment !== 'Chung') {
                              existingTeacher.group = assignedDepartment;
                            } else if (mon && mon !== 'Theo phân công') {
                              const inferred = inferDepartmentFromSubject(mon);
                              if (inferred) existingTeacher.group = inferred;
                            }
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

        // ============================================================================
        // BƯỚC 4: THUẬT TOÁN ĐỒNG BỘ TÊN VỚI "DẤU VÂN TAY LỚP HỌC + MÔN DẠY"
        // ============================================================================
        const shortToFullName = new Map<string, string>();
        
        if (pcgdSheetName) {
            const worksheet = workbook.Sheets[pcgdSheetName];
            const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[];
            
            let fullNameColIdx = -1;
            let pccmColIdx = -1;
            let headerRowIdx = -1;
            
            for (let i = 0; i < Math.min(15, jsonData.length); i++) {
                const row = jsonData[i] || [];
                for (let c = 0; c < row.length; c++) {
                    const cellStr = cleanString(row[c]).toLowerCase();
                    if (cellStr === 'họ và tên' || cellStr === 'họ tên' || cellStr === 'giáo viên' || cellStr === 'tên gv') {
                        fullNameColIdx = c;
                    }
                    if (cellStr.includes('phân công chuyên môn') || cellStr.includes('chuyên môn') || cellStr.includes('môn dạy') || cellStr.includes('giảng dạy') || cellStr.includes('môn được phân công')) {
                        pccmColIdx = c;
                    }
                }
                if (fullNameColIdx !== -1) {
                    headerRowIdx = i;
                    break;
                }
            }
            
            const pcgdTeachers: { original: string, firstName: string, pccm: string, normalizedPccm: string }[] = [];
            
            if (fullNameColIdx !== -1) {
                for (let i = headerRowIdx + 1; i < jsonData.length; i++) {
                    const row = jsonData[i] || [];
                    const fullName = cleanString(row[fullNameColIdx]);
                    const pccm = pccmColIdx !== -1 ? cleanString(row[pccmColIdx]) : '';
                    
                    if (fullName && fullName.includes(' ') && fullName.length > 4) {
                        const parts = fullName.split(' ');
                        const firstName = parts[parts.length - 1].toUpperCase();
                        
                        // Ép định dạng lớp học về chuẩn gạch chéo (VD: 6.7 thành 6/7) để dễ so sánh
                        const normalizedPccm = pccm.toUpperCase().replace(/(\d+)\.(\d+)/g, "$1/$2");
                        
                        pcgdTeachers.push({ original: fullName, firstName, pccm: pccm.toLowerCase(), normalizedPccm });
                    }
                }
            }
            
            allTeachersMap.forEach((teacher, shortName) => {
                let finalName = shortName;
                const shortNameUpper = shortName.toUpperCase();
                
                // QUY TẮC ĐẶC BIỆT: Nguyễn Thị Vân
                if (shortNameUpper.includes('VÂN') && !shortNameUpper.includes('VĂN')) {
                    if (teacher.group === 'Toán - Tin' || teacher.subject.toLowerCase().includes('toán') || teacher.subject.toLowerCase().includes('tin')) {
                        shortToFullName.set(shortName, 'Nguyễn Thị Vân (T)');
                        return; 
                    } else if (teacher.group === 'Ngoại ngữ' || teacher.subject.toLowerCase().includes('anh')) {
                        shortToFullName.set(shortName, 'Nguyễn Thị Vân');
                        return;
                    }
                }
                
                // Tránh đổi tên nếu chuỗi đã đủ dài
                if (shortName.split(' ').length >= 3 && shortName.length > 10) {
                    shortToFullName.set(shortName, shortName);
                    return;
                }

                // 1. TẠO "DẤU VÂN TAY LỚP HỌC": Thu thập tất cả các lớp mà GV này đang dạy
                const actualClasses = new Set<string>();
                uniqueSchedules.forEach(s => {
                    if (s.giao_vien === shortName) {
                        s.lop.split(',').forEach(c => {
                            const cleanClass = c.trim().replace('.', '/').toUpperCase();
                            if (cleanClass) actualClasses.add(cleanClass);
                        });
                    }
                });

                // Làm sạch tên viết tắt để chấm điểm Name Matching
                const cleanShort = shortNameUpper.replace(/[-.\_]/g, ' ').replace(/\s+/g, ' ').trim();
                const shortNoSpace = cleanShort.replace(/\s/g, '');

                let bestMatch = null;
                let maxScore = -1;
                const tSubjects = teacher.subject.toLowerCase();

                // Quét qua TOÀN BỘ giáo viên trong danh sách PCGD để chấm điểm
                pcgdTeachers.forEach(cand => {
                    let score = 0;
                    
                    // --- TIÊU CHÍ 1: TÊN GỌI ---
                    const regex = new RegExp(`\\b${cand.firstName}\\b`, 'i');
                    if (regex.test(cleanShort)) {
                        score += 15; // Trùng nguyên Tên
                    } else if (shortNoSpace.includes(cand.firstName) && cand.firstName.length >= 3) {
                        score += 10; // Tên bị dính lẹo (như DiễmV)
                    }

                    // Chấm điểm các ký tự thừa (Ví dụ: "T Vy V" -> dư chữ T và V)
                    const shortWords = cleanShort.split(' ').filter(w => w !== cand.firstName);
                    const candWords = cand.original.toUpperCase().split(' ');
                    shortWords.forEach(sw => {
                        if (sw.length === 1) {
                            if (candWords.some(cw => cw.startsWith(sw))) score += 2;
                        } else {
                            if (candWords.includes(sw)) score += 5;
                            else if (candWords.some(cw => cw.includes(sw))) score += 2;
                        }
                    });

                    // --- TIÊU CHÍ 2: VÂN TAY LỚP HỌC (SIÊU TRỌNG SỐ) ---
                    let classMatchCount = 0;
                    actualClasses.forEach(c => {
                        if (cand.normalizedPccm.includes(c)) {
                            classMatchCount++;
                            score += 20; // 1 Lớp trùng = +20 điểm (Bằng chứng thép)
                        }
                    });

                    // --- TIÊU CHÍ 3: VÂN TAY MÔN HỌC ---
                    const pccm = cand.pccm;
                    if (tSubjects.includes('toán') && pccm.includes('toán')) score += 3;
                    if (tSubjects.includes('văn') && pccm.includes('văn')) score += 3;
                    if (tSubjects.includes('anh') && pccm.includes('anh')) score += 3;
                    if ((tSubjects.includes('lý') || tSubjects.includes('khtn')) && pccm.includes('lý')) score += 3;
                    if ((tSubjects.includes('hóa') || tSubjects.includes('khtn')) && pccm.includes('hóa')) score += 3;
                    if ((tSubjects.includes('sinh') || tSubjects.includes('khtn')) && pccm.includes('sinh')) score += 3;
                    if (tSubjects.includes('sử') && (pccm.includes('sử') || pccm.includes('lịch sử'))) score += 3;
                    if (tSubjects.includes('địa') && (pccm.includes('địa') || pccm.includes('địa lý'))) score += 3;
                    if (tSubjects.includes('gdtc') && (pccm.includes('thể dục') || pccm.includes('gdtc') || pccm.includes('thể chất') || pccm.includes('qp'))) score += 3;
                    if (tSubjects.includes('tin') && pccm.includes('tin')) score += 3;
                    if ((tSubjects.includes('công nghệ') || tSubjects.includes('cnghệ')) && (pccm.includes('công nghệ') || pccm.includes('cn'))) score += 3;
                    if (tSubjects.includes('gdcd') && pccm.includes('gdcd')) score += 3;
                    if (tSubjects.includes('âm nhạc') && pccm.includes('âm nhạc')) score += 3;
                    if (tSubjects.includes('mỹ thuật') && (pccm.includes('mỹ thuật') || pccm.includes('mt'))) score += 3;
                    if (tSubjects.includes('khtn') && pccm.includes('khtn')) score += 3;

                    // Cập nhật người phù hợp nhất
                    if (score > maxScore && score > 0) {
                        maxScore = score;
                        bestMatch = cand;
                    }
                });
                
                // Cần đạt ngưỡng tối thiểu để không bị gán nhầm
                if (bestMatch && maxScore >= 10) {
                    finalName = (bestMatch as any).original;
                }
                
                shortToFullName.set(shortName, finalName);
            });
        }
        
        // ============================================================================
        // BƯỚC 5: ĐỔI TOÀN BỘ TÊN TRONG DATABASE
        // ============================================================================
        const finalSchedules = Array.from(uniqueSchedules.values()).map(s => {
            const mappedName = shortToFullName.get(s.giao_vien) || s.giao_vien;
            return { ...s, giao_vien: mappedName };
        });

        const mergedTeachersMap = new Map<string, Teacher>();
        Array.from(allTeachersMap.values()).forEach(t => {
            const mappedName = shortToFullName.get(t.name) || t.name;
            if (mergedTeachersMap.has(mappedName)) {
                const existing = mergedTeachersMap.get(mappedName)!;
                const subjects1 = existing.subject ? existing.subject.split(', ').map(s=>s.trim()) : [];
                const subjects2 = t.subject ? t.subject.split(', ').map(s=>s.trim()) : [];
                existing.subject = Array.from(new Set([...subjects1, ...subjects2])).filter(Boolean).join(', ');
            } else {
                mergedTeachersMap.set(mappedName, { ...t, name: mappedName });
            }
        });

        resolve({
          schedules: finalSchedules,
          teachers: Array.from(mergedTeachersMap.values())
        });
      } catch (error) {
        reject(error);
      }
    };

    reader.onerror = (error) => reject(error);
    reader.readAsArrayBuffer(file);
  });
};

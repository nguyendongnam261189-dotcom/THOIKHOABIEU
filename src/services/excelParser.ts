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

export const parseExcelFile = async (file: File): Promise<{ schedules: Schedule[], teachers: Teacher[] }> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });

        let uniqueSchedules: Map<string, Schedule> = new Map();
        let allTeachersMap: Map<string, Teacher> = new Map();

        // 1. CHỈ ĐỌC TÊN SHEET TKB_GV ĐỂ LẤY TỔ CHUYÊN MÔN
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
                                teacherName = teacherName.replace(/\s*\(.*\)/, '').trim();
                                teacherDepartmentDict.set(teacherName, department);
                            }
                        }
                        break; 
                    }
                }
            }
        });

        // 2. TÌM MÔN HỌC TỪ PCGD & TẠO TỪ ĐIỂN MÔN CHUẨN
        const knownSubjects = new Set<string>();
        const pcgdSheetName = workbook.SheetNames.find(name => name.toUpperCase().includes('PCGD') || name.toUpperCase().includes('PHÂN CÔNG'));
        if (pcgdSheetName) {
          const worksheet = workbook.Sheets[pcgdSheetName];
          const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[];
          let pccmColIdx = -1; let headerRowIdx = -1;
          for (let i = 0; i < Math.min(10, jsonData.length); i++) {
            const row = jsonData[i] || [];
            for (let c = 0; c < row.length; c++) {
              const cellStr = cleanString(row[c]).toLowerCase();
              if (cellStr.includes('phân công chuyên môn') || cellStr.includes('chuyên môn') || cellStr.includes('môn dạy')) {
                pccmColIdx = c; headerRowIdx = i; break;
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
        
        // Thêm cứng các môn dễ bị cắt sai (Sắp xếp dài lên trước)
        ['Toán', 'Văn', 'Anh', 'AVăn', 'Lý', 'Hóa', 'Sinh', 'Sử', 'Địa', 'GDCD', 'Tin', 'CNghệ', 'Công nghệ', 'GDTC', 'Thể dục', 'Nghệ thuật - N', 'Nghệ thuật - MT', 'Nghệ thuật', 'Âm nhạc', 'Mỹ thuật', 'KHTN1', 'KHTN2', 'KHTN3', 'KHTN', 'Lịch sử', 'Địa lý', 'CC-HĐTNHN', 'HĐTNHN', 'HĐTN-HN', 'HĐTN', 'NDGDĐP 6', 'NDGDĐP 7', 'NDGDĐP 8', 'NDGDĐP 9', 'NDGDĐP', 'SHL', 'Chào cờ'].forEach(s => knownSubjects.add(s));
        const sortedKnownSubjects = Array.from(knownSubjects).sort((a, b) => b.length - a.length);

        // 3. ĐỌC THỜI KHÓA BIỂU TỪ SHEET TKB_LOP
        workbook.SheetNames.forEach(sheetName => {
          if (!sheetName.toUpperCase().includes('TKB_LOP')) return;

          const worksheet = workbook.Sheets[sheetName];
          const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[];
          if (jsonData.length === 0) return;

          let globalBuoi: 'Sáng' | 'Chiều' = 'Sáng';
          if (sheetName.toUpperCase().includes('_C') && !sheetName.toUpperCase().includes('_SC')) globalBuoi = 'Chiều';

          let headerRowIdx = -1; let thuColIdx = -1; let tietColIdx = -1;
          for (let i = 0; i < Math.min(15, jsonData.length); i++) {
            const row = jsonData[i] || [];
            let foundThu = -1; let foundTiet = -1;
            for (let c = 0; c < Math.min(5, row.length); c++) {
              const cellStr = cleanString(row[c]).toLowerCase();
              if ((cellStr.includes('thứ') || cellStr.includes('thu')) && foundThu === -1) foundThu = c;
              if ((cellStr.includes('tiết') || cellStr.includes('tiet')) && foundTiet === -1) foundTiet = c;
            }
            if (foundThu !== -1 && foundTiet !== -1) { headerRowIdx = i; thuColIdx = foundThu; tietColIdx = foundTiet; break; }
          }

          if (headerRowIdx !== -1) {
            const headerRow1 = jsonData[headerRowIdx] || [];
            const headerRow2 = jsonData[headerRowIdx + 1] || [];
            const colMap: { [key: number]: { className: string, buoi: 'Sáng' | 'Chiều' } } = {};
            
            let currentClass = '';

            for (let c = 0; c < Math.max(headerRow1.length, headerRow2.length); c++) {
              if (c === thuColIdx || c === tietColIdx) continue;
              const val1 = cleanString(headerRow1[c]);
              const val2 = cleanString(headerRow2[c]);
              
              if (val1 && val1.toLowerCase() !== 'sáng' && val1.toLowerCase() !== 'chiều') {
                currentClass = val1.replace(/\s*\(.*\)/, '').trim(); 
              }

              if (currentClass) {
                let colBuoi = globalBuoi;
                if (sheetName.toUpperCase().includes('_SC')) {
                    if (val1.toLowerCase() === 'sáng' || val2.toLowerCase() === 'sáng') colBuoi = 'Sáng';
                    if (val1.toLowerCase() === 'chiều' || val2.toLowerCase() === 'chiều') colBuoi = 'Chiều';
                }
                colMap[c] = { className: formatClassName(currentClass), buoi: colBuoi };
              }
            }

            let currentThu = 2;
            for (let i = headerRowIdx + 1; i < jsonData.length; i++) {
              const row = jsonData[i] || [];
              let rowThuStr = cleanString(row[thuColIdx]);
              let rowTietStr = cleanString(row[tietColIdx]);
              
              if (rowThuStr) {
                const thuMatch = rowThuStr.toLowerCase().match(/\d+/);
                if (thuMatch) currentThu = parseInt(thuMatch[0]);
              }
              
              let currentTiet = parseInt(rowTietStr);
              if (!isNaN(currentTiet)) {
                for (let c = 0; c < row.length; c++) {
                  if (colMap[c]) {
                    const cellData = cleanString(row[c]);
                    if (cellData) {
                      let mon = ''; 
                      let giao_vien = ''; 
                      const cleanCellData = cellData.replace(/\r/g, '').trim();
                      
                      let matchedSubject = sortedKnownSubjects.find(s => cleanCellData.toUpperCase().startsWith(s.toUpperCase()));
                      
                      if (matchedSubject) {
                        mon = matchedSubject;
                        // Cắt bỏ phần Môn, lấy phần Tên GV và dọn dẹp các dấu gạch ngang thừa
                        giao_vien = cleanCellData.substring(matchedSubject.length).replace(/^[- \t]+/, '').trim();
                      } else {
                        // Nếu không tìm thấy trong từ điển, cắt bằng dấu gạch ngang CUỐI CÙNG (an toàn hơn)
                        const lastDashIdx = cleanCellData.lastIndexOf('-');
                        if (lastDashIdx !== -1) {
                            mon = cleanCellData.substring(0, lastDashIdx).trim();
                            giao_vien = cleanCellData.substring(lastDashIdx + 1).trim();
                        } else {
                            mon = cleanCellData;
                            giao_vien = ''; // Trống tên
                        }
                      }

                      if (!giao_vien) giao_vien = 'Chưa rõ'; // Đánh dấu là chưa rõ

                      const scheduleObj: Schedule = {
                        thu: currentThu,
                        tiet: currentTiet > 5 ? currentTiet - 5 : currentTiet,
                        lop: colMap[c].className, 
                        mon: mon,
                        giao_vien: giao_vien,
                        phong: '',
                        buoi: currentTiet > 5 ? 'Chiều' : colMap[c].buoi
                      };

                      const key = `${scheduleObj.thu}-${scheduleObj.buoi}-${scheduleObj.tiet}-${scheduleObj.giao_vien}-${scheduleObj.mon}`;
                      if (uniqueSchedules.has(key)) {
                        const existing = uniqueSchedules.get(key)!;
                        const currentLops = existing.lop.split(',').map(l => l.trim());
                        if (!currentLops.includes(scheduleObj.lop)) {
                          existing.lop = `${existing.lop}, ${scheduleObj.lop}`;
                        }
                      } else {
                        uniqueSchedules.set(key, scheduleObj);
                      }

                      // Ghi nhận Môn dạy cho Giáo viên
                      if (!allTeachersMap.has(giao_vien)) {
                        allTeachersMap.set(giao_vien, {
                          name: giao_vien,
                          subject: mon,
                          group: teacherDepartmentDict.get(giao_vien) || 'Chung'
                        });
                      } else {
                        const existingT = allTeachersMap.get(giao_vien)!;
                        const currentSubjects = existingT.subject ? existingT.subject.split(', ').map(s=>s.trim()) : [];
                        if (!currentSubjects.includes(mon)) {
                            existingT.subject = existingT.subject ? `${existingT.subject}, ${mon}` : mon;
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        });

        // 4. ĐỒNG BỘ TÊN ĐẦY ĐỦ TỪ PCGD
        const shortToFullName = new Map<string, string>();
        const pcgdTeachers: { fullName: string, uniqueName: string, firstName: string, classes: Set<string>, pccmStr: string }[] = [];
        if (pcgdSheetName) {
            const worksheet = workbook.Sheets[pcgdSheetName];
            const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[];
            let fullNameColIdx = -1; let pccmColIdx = -1; let headerRowIdx = -1;
            for (let i = 0; i < Math.min(15, jsonData.length); i++) {
                const row = jsonData[i] || [];
                for (let c = 0; c < row.length; c++) {
                    const cellStr = cleanString(row[c]).toLowerCase();
                    if (cellStr === 'họ và tên' || cellStr === 'họ tên' || cellStr === 'giáo viên' || cellStr === 'tên gv') fullNameColIdx = c;
                    if (cellStr.includes('phân công chuyên môn') || cellStr.includes('chuyên môn') || cellStr.includes('môn dạy')) pccmColIdx = c;
                }
                if (fullNameColIdx !== -1) { headerRowIdx = i; break; }
            }
            if (fullNameColIdx !== -1) {
                for (let i = headerRowIdx + 1; i < jsonData.length; i++) {
                    const row = jsonData[i] || [];
                    const fullName = cleanString(row[fullNameColIdx]);
                    if (!fullName || fullName.length < 4 || !fullName.includes(' ')) continue;
                    const pccmStr = pccmColIdx !== -1 ? cleanString(row[pccmColIdx]) : '';
                    const classMatches = pccmStr.match(/\d{1,2}\s*[./]\s*\d{1,2}/g) || [];
                    const pcgdClasses = new Set(classMatches.map(c => formatClassName(c))); 
                    pcgdTeachers.push({ fullName, uniqueName: fullName, firstName: fullName.split(' ').pop()?.toUpperCase() || '', classes: pcgdClasses, pccmStr: pccmStr.toUpperCase() });
                }
            }

            const tkbTeacherData = new Map<string, { classes: Set<string> }>();
            uniqueSchedules.forEach(s => {
                if (!tkbTeacherData.has(s.giao_vien)) tkbTeacherData.set(s.giao_vien, { classes: new Set() });
                s.lop.split(',').forEach(c => {
                    const cleanC = formatClassName(c); 
                    if (cleanC && cleanC !== 'CHƯAXẾP') tkbTeacherData.get(s.giao_vien)!.classes.add(cleanC);
                });
            });

            allTeachersMap.forEach((teacher, shortName) => {
                // 🔥 CHỐT CHẶN: TUYỆT ĐỐI KHÔNG ĐỒNG BỘ CHO KẺ MẠO DANH "Chưa rõ"
                if (!shortName || shortName === 'Chưa rõ') {
                    shortToFullName.set(shortName, 'Chưa rõ');
                    return;
                }

                const tkbClasses = tkbTeacherData.get(shortName)?.classes || new Set();
                let bestMatch = null; let maxScore = -1;
                
                // Lấy tên gốc để so sánh (Bỏ các chữ cái phụ phí sau, ví dụ: Tâm H -> TÂM)
                const baseNameMatch = shortName.match(/^[A-ZĐÁÀẢÃẠĂẮẰẲẴẶÂẤẦẨẪẬÉÈẺẼẸÊẾỀỂỄỆÍÌỈĨỊÓÒỎÕỌÔỐỒỔỖỘƠỚỜỞỠỢÚÙỦŨỤƯỨỪỬỮỰÝỲỶỸỴa-zđáàảãạăắằẳẵặâấầẩẫậéèẻẽẹêếềểễệíìỉĩịóòỏõọôốồổỗộơớờởỡợúùủũụưứừửữựýỳỷỹỵ]+/);
                const baseName = baseNameMatch ? baseNameMatch[0].toUpperCase() : shortName.toUpperCase();

                pcgdTeachers.forEach(cand => {
                    let score = 0;
                    const candUpper = cand.fullName.toUpperCase();
                    
                    // Điểm cộng theo Tên (Bắt buộc phải có độ trùng khớp tên mới xét tiếp)
                    if (candUpper === shortName.toUpperCase()) score += 2000;
                    else if (cand.firstName === baseName) score += 500;
                    else if (candUpper.includes(shortName.toUpperCase())) score += 100;
                    else if (candUpper.includes(baseName)) score += 50;

                    // Điểm cộng theo Lớp giảng dạy
                    tkbClasses.forEach(c => { if (cand.classes.has(c)) score += 1000; });
                    
                    // Chỉ map tên nếu Điểm số > 0 (Tránh việc không giống tên tí nào mà vẫn map)
                    if (score > maxScore && score > 0) { 
                        maxScore = score; 
                        bestMatch = cand; 
                    }
                });
                shortToFullName.set(shortName, bestMatch ? (bestMatch as any).uniqueName : shortName);
            });
        }
        
        // 5. KẾT XUẤT DỮ LIỆU
        const finalSchedules = Array.from(uniqueSchedules.values()).map(s => ({
            ...s,
            giao_vien: shortToFullName.get(s.giao_vien) || s.giao_vien,
        }));

        const mergedTeachersMap = new Map<string, Teacher>();
        Array.from(allTeachersMap.values()).forEach(t => {
            // 🔥 CHỐT CHẶN 2: KHÔNG TẠO HỒ SƠ TÀI KHOẢN CHO "CHƯA RÕ" TRONG ADMIN
            if (!t.name || t.name === 'Chưa rõ') return;

            const mappedName = shortToFullName.get(t.name) || t.name;
            
            let finalGroup = t.group;
            if (finalGroup === 'Chung') {
                const inferred = inferDepartmentFromSubject(t.subject);
                if (inferred) finalGroup = inferred;
            }

            if (mergedTeachersMap.has(mappedName)) {
                const existing = mergedTeachersMap.get(mappedName)!;
                const subjects1 = existing.subject ? existing.subject.split(', ').map(s=>s.trim()) : [];
                const subjects2 = t.subject ? t.subject.split(', ').map(s=>s.trim()) : [];
                existing.subject = Array.from(new Set([...subjects1, ...subjects2])).filter(Boolean).join(', ');
                if (existing.group === 'Chung' && finalGroup !== 'Chung') existing.group = finalGroup;
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

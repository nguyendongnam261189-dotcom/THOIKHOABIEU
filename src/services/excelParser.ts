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
        // 🔥 ĐỔI KIỂU DỮ LIỆU: Sử dụng Map để đếm số tiết dạy của từng môn
        let allTeachersMap: Map<string, { name: string; group: string; subjectCounts: Map<string, number> }> = new Map();

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

                      // 🔥 TÍNH NĂNG MỚI: ĐẾM SỐ TIẾT DẠY ĐỂ TÌM MÔN CHÍNH
                      if (giao_vien !== 'Chưa rõ') {
                        if (!allTeachersMap.has(giao_vien)) {
                          allTeachersMap.set(giao_vien, {
                            name: giao_vien,
                            subjectCounts: new Map<string, number>([[mon, 1]]),
                            group: teacherDepartmentDict.get(giao_vien) || 'Chung'
                          });
                        } else {
                          const existingT = allTeachersMap.get(giao_vien)!;
                          existingT.subjectCounts.set(mon, (existingT.subjectCounts.get(mon) || 0) + 1);
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        });

        // 4. ĐỒNG BỘ TÊN ĐẦY ĐỦ TỪ PCGD (CHỐNG CƯỚP DANH TÍNH)
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
                // CHỐT CHẶN: TUYỆT ĐỐI KHÔNG ĐỒNG BỘ CHO KẺ MẠO DANH "Chưa rõ"
                if (!shortName || shortName === 'Chưa rõ') {
                    shortToFullName.set(shortName, 'Chưa rõ');
                    return;
                }

                const tkbClasses = tkbTeacherData.get(shortName)?.classes || new Set();
                let bestMatch = null; 
                let maxScore = 0; // 🔥 Bắt buộc điểm phải > 0 mới được map
                
                const baseNameMatch = shortName.match(/^[A-ZĐÁÀẢÃẠĂẮẰẲẴẶÂẤẦẨẪẬÉÈẺẼẸÊẾỀỂỄỆÍÌỈĨỊÓÒỎÕỌÔỐỒỔỖỘƠỚỜỞỠỢÚÙỦŨỤƯỨỪỬỮỰÝỲỶỸỴa-zđáàảãạăắằẳẵặâấầẩẫậéèẻẽẹêếềểễệíìỉĩịóòỏõọôốồổỗộơớờởỡợúùủũụưứừửữựýỳỷỹỵ]+/);
                const baseName = baseNameMatch ? baseNameMatch[0].toUpperCase() : shortName.toUpperCase();

                pcgdTeachers.forEach(cand => {
                    let score = 0;
                    const candUpper = cand.fullName.toUpperCase();
                    const shortUpper = shortName.toUpperCase();
                    
                    // 🔥 TIÊU CHÍ CHÍNH: TÊN (Trọng số khổng lồ)
                    if (candUpper === shortUpper) score += 100000;
                    else if (cand.firstName === baseName) score += 10000;
                    else if (candUpper.includes(shortUpper)) score += 5000;
                    else if (candUpper.includes(baseName)) score += 1000;

                    // 🔥 TIÊU CHÍ PHỤ: LỚP (Chỉ làm Tie-breaker khi đã có điểm Tên)
                    if (score > 0) {
                        tkbClasses.forEach(c => { if (cand.classes.has(c)) score += 10; });
                    }
                    
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

        const mergedTeachersMap = new Map<string, any>();
        Array.from(allTeachersMap.values()).forEach(t => {
            if (!t.name || t.name === 'Chưa rõ') return;

            const mappedName = shortToFullName.get(t.name) || t.name;
            let finalGroup = t.group;
            
            // TÌM MÔN CHÍNH (Môn dạy nhiều tiết nhất)
            let topSubject = ''; let maxCount = 0;
            t.subjectCounts.forEach((count: number, mon: string) => {
                if (count > maxCount) { maxCount = count; topSubject = mon; }
            });

            // NẾU TỔ LÀ CHUNG, ĐOÁN THEO MÔN CHÍNH
            if (finalGroup === 'Chung') {
                const inferred = inferDepartmentFromSubject(topSubject);
                if (inferred) finalGroup = inferred;
            }

            if (mergedTeachersMap.has(mappedName)) {
                // Cộng dồn bộ đếm tiết dạy
                const existing = mergedTeachersMap.get(mappedName)!;
                t.subjectCounts.forEach((count: number, mon: string) => {
                    existing.subjectCounts.set(mon, (existing.subjectCounts.get(mon) || 0) + count);
                });
                if (existing.group === 'Chung' && finalGroup !== 'Chung') existing.group = finalGroup;
            } else {
                mergedTeachersMap.set(mappedName, { ...t, name: mappedName, group: finalGroup, subjectCounts: new Map(t.subjectCounts) });
            }
        });

        // 🔥 BIẾN HÓA BỘ ĐẾM THÀNH CHUỖI MÔN HỌC (Sắp xếp giảm dần theo số tiết)
        const finalTeachers: Teacher[] = Array.from(mergedTeachersMap.values()).map(t => {
            const sortedSubjects = Array.from((t.subjectCounts as Map<string, number>).entries())
                .sort((a, b) => b[1] - a[1]) // Dạy nhiều nhất xếp lên đầu
                .map(entry => entry[0]);
            
            return {
                id: '', // Dummy id, Firestore sẽ tự tạo
                name: t.name,
                subject: sortedSubjects.join(', '), // VD: "Toán, Tin, HĐTNHN"
                group: t.group
            } as Teacher;
        });

        resolve({ schedules: finalSchedules, teachers: finalTeachers });
      } catch (error) { reject(error); }
    };
    reader.readAsArrayBuffer(file);
  });
};

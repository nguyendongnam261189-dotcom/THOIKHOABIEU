import * as XLSX from 'xlsx';
import { Schedule, Teacher } from '../types';

// 🔥 HÀM KHỬ DẤU: Giải quyết triệt để ca "BinhV2" vs "Bình"
const removeAccents = (str: string): string => {
  return str.normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/đ/g, 'd').replace(/Đ/g, 'D');
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
        let mergedTeachersMap = new Map<string, { name: string; group: string; subjectCounts: Map<string, number> }>();

        // ============================================================================
        // BƯỚC 1: ĐỌC SHEET TKB_GV LẤY GỢI Ý TỔ CHUYÊN MÔN
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
                                teacherName = teacherName.replace(/\s*\(.*\)/, '').trim();
                                teacherDepartmentDict.set(teacherName, department);
                            }
                        }
                        break; 
                    }
                }
            }
        });

        // ============================================================================
        // BƯỚC 2: ĐỌC DANH BẠ PCGD TRƯỚC ĐỂ LÀM BỘ TỪ ĐIỂN QUY CHIẾU (CHỐNG CƯỚP TIẾT)
        // ============================================================================
        const knownSubjects = new Set<string>();
        const pcgdTeachers: { fullName: string, uniqueName: string, firstName: string, classes: Set<string>, pccmStr: string, parsedSubjects: Set<string> }[] = [];
        
        const pcgdSheetName = workbook.SheetNames.find(name => name.toUpperCase().includes('PCGD') || name.toUpperCase().includes('PHÂN CÔNG'));
        if (pcgdSheetName) {
          const worksheet = workbook.Sheets[pcgdSheetName];
          const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[];
          let pccmColIdx = -1; let fullNameColIdx = -1; let headerRowIdx = -1;
          
          for (let i = 0; i < Math.min(15, jsonData.length); i++) {
            const row = jsonData[i] || [];
            for (let c = 0; c < row.length; c++) {
              const cellStr = cleanString(row[c]).toLowerCase();
              if (cellStr === 'họ và tên' || cellStr === 'họ tên' || cellStr === 'giáo viên' || cellStr === 'tên gv') fullNameColIdx = c;
              if (cellStr.includes('phân công chuyên môn') || cellStr.includes('chuyên môn') || cellStr.includes('môn dạy')) pccmColIdx = c;
            }
            if (fullNameColIdx !== -1) { headerRowIdx = i; break; }
          }

          if (fullNameColIdx !== -1 && pccmColIdx !== -1) {
            for (let i = headerRowIdx + 1; i < jsonData.length; i++) {
              const row = jsonData[i] || [];
              const fullName = cleanString(row[fullNameColIdx]);
              if (!fullName || fullName.length < 4 || !fullName.includes(' ')) continue;
              
              const pccmStr = cleanString(row[pccmColIdx]);
              const classMatches = pccmStr.match(/\d{1,2}\s*[./]\s*\d{1,2}/g) || [];
              const pcgdClasses = new Set(classMatches.map(c => formatClassName(c))); 
              
              const parsedSubjects = new Set<string>();
              const lines = pccmStr.split('\n');
              lines.forEach(line => {
                const parts = line.split('+').map(s => s.trim());
                parts.forEach(part => {
                  const subject = part.replace(/\s*\(.*?\)\s*/g, '').trim();
                  if (subject) {
                      knownSubjects.add(subject);
                      parsedSubjects.add(subject.toUpperCase());
                  }
                });
              });

              pcgdTeachers.push({ 
                  fullName, 
                  uniqueName: fullName, 
                  firstName: fullName.split(' ').pop()?.toUpperCase() || '', 
                  classes: pcgdClasses, 
                  pccmStr: pccmStr.toUpperCase(),
                  parsedSubjects
              });
            }
          }
        }
        
        // Thêm cứng các môn dễ bị cắt sai
        ['Toán', 'Văn', 'Anh', 'AVăn', 'Lý', 'Hóa', 'Sinh', 'Sử', 'Địa', 'GDCD', 'Tin', 'CNghệ', 'Công nghệ', 'GDTC', 'Thể dục', 'Nghệ thuật - N', 'Nghệ thuật - MT', 'Nghệ thuật', 'Âm nhạc', 'Mỹ thuật', 'KHTN1', 'KHTN2', 'KHTN3', 'KHTN', 'Lịch sử', 'Địa lý', 'CC-HĐTNHN', 'HĐTNHN', 'HĐTN-HN', 'HĐTN', 'NDGDĐP 6', 'NDGDĐP 7', 'NDGDĐP 8', 'NDGDĐP 9', 'NDGDĐP', 'SHL', 'Chào cờ'].forEach(s => knownSubjects.add(s));
        const sortedKnownSubjects = Array.from(knownSubjects).sort((a, b) => b.length - a.length);

        // Đánh dấu người trùng tên (VD: Nguyễn Thị Vân (TOÁN))
        pcgdTeachers.forEach(t => {
            const count = pcgdTeachers.filter(x => x.fullName === t.fullName).length;
            if (count > 1) {
                const subjMatch = t.pccmStr.match(/^[A-ZĐÁÀẢÃẠĂẮẰẲẴẶÂẤẦẨẪẬÉÈẺẼẸÊẾỀỂỄỆÍÌỈĨỊÓÒỎÕỌÔỐỒỔỖỘƠỚỜỞỠỢÚÙỦŨỤƯỨỪỬỮỰÝỲỶỸỴ]+/i);
                t.uniqueName = `${t.fullName} (${subjMatch ? subjMatch[0].trim().toUpperCase() : 'GV'})`;
            }
        });

        // ============================================================================
        // BƯỚC 3: ĐỌC TKB_LOP VÀ "PHÂN XỬ" TÊN GIÁO VIÊN NGAY TRÊN TỪNG Ô
        // ============================================================================
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
                      let giao_vien_raw = ''; 
                      const cleanCellData = cellData.replace(/\r/g, '').trim();
                      
                      let matchedSubject = sortedKnownSubjects.find(s => cleanCellData.toUpperCase().startsWith(s.toUpperCase()));
                      
                      if (matchedSubject) {
                        mon = matchedSubject;
                        giao_vien_raw = cleanCellData.substring(matchedSubject.length).replace(/^[- \t]+/, '').trim();
                      } else {
                        const lastDashIdx = cleanCellData.lastIndexOf('-');
                        if (lastDashIdx !== -1) {
                            mon = cleanCellData.substring(0, lastDashIdx).trim();
                            giao_vien_raw = cleanCellData.substring(lastDashIdx + 1).trim();
                        } else {
                            mon = cleanCellData;
                            giao_vien_raw = ''; 
                        }
                      }

                      // 🔥 THUẬT TOÁN PHÂN XỬ TÊN NGAY TẠI TRẬN (Chống cướp tiết & Khử dấu)
                      let resolvedName = 'Chưa rõ';
                      if (giao_vien_raw && giao_vien_raw.toLowerCase() !== 'chưa rõ') {
                          let bestMatch = null; 
                          let maxScore = 0; 
                          
                          const shortUpper = giao_vien_raw.toUpperCase().replace(/\s+/g, '');
                          const shortNoAccent = removeAccents(shortUpper);
                          const monUpper = mon.toUpperCase();

                          pcgdTeachers.forEach(cand => {
                              let nameScore = 0;
                              const candUpper = cand.fullName.toUpperCase().replace(/\s+/g, ''); 
                              const candNoAccent = removeAccents(candUpper);
                              const firstName = cand.firstName.toUpperCase();
                              const firstNoAccent = removeAccents(firstName);
                              
                              // 1. Chấm điểm Tên
                              if (candUpper === shortUpper) nameScore += 100000;
                              else if (candNoAccent === shortNoAccent) nameScore += 80000;
                              else if (candUpper.includes(shortUpper)) nameScore += 10000;
                              else if (candNoAccent.includes(shortNoAccent)) nameScore += 5000;
                              else if (shortUpper.includes(firstName)) nameScore += 2000;
                              else if (shortNoAccent.includes(firstNoAccent)) nameScore += 1000;

                              // 2. Chấm điểm Context (Chỉ khi Tên có độ trùng khớp)
                              if (nameScore > 0) {
                                  let contextScore = 0;
                                  
                                  // Chấm Môn: Phân biệt Hoài Thi (Toán) và Minh Thi (Văn)
                                  if (monUpper) {
                                      cand.parsedSubjects.forEach(s => {
                                          if (monUpper.includes(s) || s.includes(monUpper)) {
                                              contextScore += 2000;
                                          }
                                      });
                                  }
                                  
                                  // Chấm Lớp: Phân biệt nếu trùng cả tên lẫn môn (cực hiếm)
                                  if (cand.classes.has(colMap[c].className)) contextScore += 500;
                                  
                                  const totalScore = nameScore + contextScore;
                                  if (totalScore > maxScore) { 
                                      maxScore = totalScore; 
                                      bestMatch = cand; 
                                  }
                              }
                          });
                          
                          resolvedName = bestMatch ? bestMatch.uniqueName : giao_vien_raw;
                      }

                      const scheduleObj: Schedule = {
                        thu: currentThu,
                        tiet: currentTiet > 5 ? currentTiet - 5 : currentTiet,
                        lop: colMap[c].className, 
                        mon: mon,
                        giao_vien: resolvedName,
                        phong: '',
                        buoi: currentTiet > 5 ? 'Chiều' : colMap[c].buoi
                      };

                      // Gộp tiết (Nếu dạy 2 lớp cùng lúc)
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

                      // Cập nhật Database Tạm (Đếm Môn)
                      if (resolvedName !== 'Chưa rõ') {
                        if (!mergedTeachersMap.has(resolvedName)) {
                            mergedTeachersMap.set(resolvedName, {
                                name: resolvedName,
                                group: teacherDepartmentDict.get(resolvedName) || 'Chung',
                                subjectCounts: new Map<string, number>()
                            });
                        }
                        const teacherData = mergedTeachersMap.get(resolvedName)!;
                        teacherData.subjectCounts.set(mon, (teacherData.subjectCounts.get(mon) || 0) + 1);
                      }
                    }
                  }
                }
              }
            }
          }
        });

        // ============================================================================
        // BƯỚC 4: KẾT XUẤT VÀ VỚT GIÁO VIÊN
        // ============================================================================
        const finalSchedules = Array.from(uniqueSchedules.values());

        // 🔥 TÍNH NĂNG MỚI: QUÉT LẠI PCGD ĐỂ VỚT CÁC GIÁO VIÊN CÓ TRONG DANH BẠ NHƯNG CHƯA ĐƯỢC XẾP LỊCH
        pcgdTeachers.forEach(cand => {
            if (!mergedTeachersMap.has(cand.uniqueName)) {
                let inferredGroup = 'Chung';
                const mainSubjMatch = cand.pccmStr.match(/^[A-ZĐÁÀẢÃẠĂẮẰẲẴẶÂẤẦẨẪẬÉÈẺẼẸÊẾỀỂỄỆÍÌỈĨỊÓÒỎÕỌÔỐỒỔỖỘƠỚỜỞỠỢÚÙỦŨỤƯỨỪỬỮỰÝỲỶỸỴ]+/i);
                if (mainSubjMatch) {
                    inferredGroup = inferDepartmentFromSubject(mainSubjMatch[0].trim()) || 'Chung';
                }
                mergedTeachersMap.set(cand.uniqueName, {
                    name: cand.uniqueName,
                    group: inferredGroup,
                    subjectCounts: new Map() // Đảm bảo số tiết = 0
                });
            }
        });

        const finalTeachers: Teacher[] = Array.from(mergedTeachersMap.values()).map(t => {
            let finalGroup = t.group;
            
            // Tìm môn chính để sắp xếp và nội suy Tổ (nếu đang là Chung)
            const sortedSubjects = Array.from((t.subjectCounts as Map<string, number>).entries())
                .sort((a, b) => b[1] - a[1])
                .map(entry => entry[0]);
            
            if (finalGroup === 'Chung' && sortedSubjects.length > 0) {
                const inferred = inferDepartmentFromSubject(sortedSubjects[0]);
                if (inferred) finalGroup = inferred;
            }

            return {
                id: '', 
                name: t.name,
                subject: sortedSubjects.join(', '), 
                group: finalGroup
            } as Teacher;
        });

        resolve({ schedules: finalSchedules, teachers: finalTeachers });
      } catch (error) { reject(error); }
    };
    reader.readAsArrayBuffer(file);
  });
};

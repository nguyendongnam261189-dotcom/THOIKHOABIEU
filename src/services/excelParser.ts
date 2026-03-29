import * as XLSX from 'xlsx';
import { Schedule } from '../types';

// ============================================================================
// CÁC INTERFACE GIAO TIẾP VỚI TRANG ADMIN
// ============================================================================
export interface TKBTeacher {
    originalName: string;
    inferredGroup: string;
    subjectCounts: Map<string, number>;
}

export interface PCGDTeacher {
    uniqueName: string;
    fullName: string;
    firstName: string;
    pccmStr: string;
    classes: Set<string>;
    parsedSubjects: Set<string>;
}

export interface ParseResult {
    rawSchedules: Schedule[];
    tkbTeachers: TKBTeacher[];
    pcgdTeachers: PCGDTeacher[];
    suggestedMapping: Record<string, string>; // Gợi ý của máy: { "BinhV2": "Phùng Thị Bình" }
}

// ============================================================================
// HÀM HỖ TRỢ
// ============================================================================
const removeAccents = (str: string): string => {
    return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D');
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
    return String(className).trim().replace(/\./g, '/').replace(/\s+/g, '');
};

const cleanString = (str: any): string => {
    if (str === null || str === undefined) return '';
    return String(str).normalize('NFC').trim();
};

// ============================================================================
// HÀM XỬ LÝ CHÍNH
// ============================================================================
export const parseExcelFile = async (file: File): Promise<ParseResult> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = (e) => {
            try {
                const data = new Uint8Array(e.target?.result as ArrayBuffer);
                const workbook = XLSX.read(data, { type: 'array' });

                const rawSchedulesMap: Map<string, Schedule> = new Map();
                const tkbTeachersMap = new Map<string, TKBTeacher>();
                
                // 1. ĐỌC SHEET TKB_GV ĐỂ LẤY GỢI Ý TỔ CHUYÊN MÔN
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
                            if (rowStr.includes('thứ') || rowStr.includes('thu') || rowStr.includes('tiết')) {
                                for (let c = 2; c < row.length; c++) {
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

                // 2. LẤY DANH BẠ GỐC TỪ PCGD (Dữ liệu Cột 2)
                const knownSubjects = new Set<string>();
                const pcgdTeachers: PCGDTeacher[] = [];
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
                                uniqueName: fullName,
                                fullName,
                                firstName: fullName.split(' ').pop()?.toUpperCase() || '',
                                pccmStr: pccmStr.toUpperCase(),
                                classes: pcgdClasses,
                                parsedSubjects
                            });
                        }
                    }
                }

                ['Toán', 'Văn', 'Anh', 'AVăn', 'Lý', 'Hóa', 'Sinh', 'Sử', 'Địa', 'GDCD', 'Tin', 'CNghệ', 'Công nghệ', 'GDTC', 'Thể dục', 'Nghệ thuật - N', 'Nghệ thuật - MT', 'Nghệ thuật', 'Âm nhạc', 'Mỹ thuật', 'KHTN1', 'KHTN2', 'KHTN3', 'KHTN', 'Lịch sử', 'Địa lý', 'CC-HĐTNHN', 'HĐTNHN', 'HĐTN-HN', 'HĐTN', 'NDGDĐP 6', 'NDGDĐP 7', 'NDGDĐP 8', 'NDGDĐP 9', 'NDGDĐP', 'SHL', 'Chào cờ'].forEach(s => knownSubjects.add(s));
                const sortedKnownSubjects = Array.from(knownSubjects).sort((a, b) => b.length - a.length);

                // Xử lý trùng tên PCGD
                pcgdTeachers.forEach(t => {
                    const count = pcgdTeachers.filter(x => x.fullName === t.fullName).length;
                    if (count > 1) {
                        const subjMatch = t.pccmStr.match(/^[A-ZĐÁÀẢÃẠĂẮẰẲẴẶÂẤẦẨẪẬÉÈẺẼẸÊẾỀỂỄỆÍÌỈĨỊÓÒỎÕỌÔỐỒỔỖỘƠỚỜỞỠỢÚÙỦŨỤƯỨỪỬỮỰÝỲỶỸỴ]+/i);
                        t.uniqueName = `${t.fullName} (${subjMatch ? subjMatch[0].trim().toUpperCase() : 'GV'})`;
                    }
                });

                // 3. ĐỌC TKB_LOP ĐỂ TẠO LỊCH THÔ (Dữ liệu Cột 1)
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

                                            if (!giao_vien_raw) giao_vien_raw = 'Chưa rõ';

                                            // Đẩy TÊN GỐC vào rawSchedules
                                            const scheduleObj: Schedule = {
                                                thu: currentThu,
                                                tiet: currentTiet > 5 ? currentTiet - 5 : currentTiet,
                                                lop: colMap[c].className,
                                                mon: mon,
                                                giao_vien: giao_vien_raw, 
                                                phong: '',
                                                buoi: currentTiet > 5 ? 'Chiều' : colMap[c].buoi
                                            };

                                            const key = `${scheduleObj.thu}-${scheduleObj.buoi}-${scheduleObj.tiet}-${scheduleObj.giao_vien}-${scheduleObj.mon}`;
                                            if (rawSchedulesMap.has(key)) {
                                                const existing = rawSchedulesMap.get(key)!;
                                                const currentLops = existing.lop.split(',').map(l => l.trim());
                                                if (!currentLops.includes(scheduleObj.lop)) {
                                                    existing.lop = `${existing.lop}, ${scheduleObj.lop}`;
                                                }
                                            } else {
                                                rawSchedulesMap.set(key, scheduleObj);
                                            }

                                            // Thu thập danh sách TÊN VIẾT TẮT
                                            if (giao_vien_raw !== 'Chưa rõ') {
                                                if (!tkbTeachersMap.has(giao_vien_raw)) {
                                                    tkbTeachersMap.set(giao_vien_raw, {
                                                        originalName: giao_vien_raw,
                                                        inferredGroup: teacherDepartmentDict.get(giao_vien_raw) || 'Chung',
                                                        subjectCounts: new Map<string, number>()
                                                    });
                                                }
                                                const tData = tkbTeachersMap.get(giao_vien_raw)!;
                                                tData.subjectCounts.set(mon, (tData.subjectCounts.get(mon) || 0) + 1);
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                });

                // 4. MÁY TÍNH "CHẤM ĐIỂM" VÀ ĐƯA RA GỢI Ý MAPPING
                const suggestedMapping: Record<string, string> = {};
                
                tkbTeachersMap.forEach((tkbData, shortName) => {
                    let bestMatch: PCGDTeacher | null = null;
                    let maxScore = 0;

                    const shortUpper = shortName.toUpperCase().replace(/\s+/g, '');
                    const shortNoAccent = removeAccents(shortUpper);

                    pcgdTeachers.forEach(cand => {
                        let score = 0;
                        const candUpper = cand.fullName.toUpperCase().replace(/\s+/g, '');
                        const candNoAccent = removeAccents(candUpper);
                        const firstName = cand.firstName.toUpperCase();
                        const firstNoAccent = removeAccents(firstName);

                        // Điểm Tên (Góp phần phá giải ca BinhV2)
                        if (candUpper === shortUpper) score += 10000;
                        else if (candNoAccent === shortNoAccent) score += 8000;
                        else if (candUpper.includes(shortUpper)) score += 1000;
                        else if (candNoAccent.includes(shortNoAccent)) score += 500;
                        else if (shortUpper.includes(firstName)) score += 200;
                        else if (shortNoAccent.includes(firstNoAccent)) score += 100;

                        // Điểm Môn (Chỉ tính nếu tên có sự liên quan)
                        if (score > 0) {
                            tkbData.subjectCounts.forEach((_, mon) => {
                                if (mon && cand.pccmStr.includes(mon.toUpperCase())) score += 50;
                            });
                        }

                        // Ngưỡng an toàn (Điểm > 150 máy mới dám tự nhận vơ)
                        if (score > maxScore && score > 150) {
                            maxScore = score;
                            bestMatch = cand;
                        }
                    });

                    // Lưu vào từ điển gợi ý
                    if (bestMatch) {
                        suggestedMapping[shortName] = bestMatch.uniqueName;
                    }
                });

                // Chuyển Map thành Mảng để gửi đi
                const rawSchedules = Array.from(rawSchedulesMap.values());
                const tkbTeachers = Array.from(tkbTeachersMap.values());

                resolve({ rawSchedules, tkbTeachers, pcgdTeachers, suggestedMapping });

            } catch (error) { reject(error); }
        };
        reader.readAsArrayBuffer(file);
    });
};

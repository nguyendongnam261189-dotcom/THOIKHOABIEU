// ============================================================================
// 1. HÀM LOGIC LÕI (Dùng cho Thuật toán Dạy thay - GIỮ NGUYÊN BẢN GỐC CỦA THẦY)
// ============================================================================
export const normalizeSubjectName = (subject: string): string => {
  if (!subject) return '';
  let normalized = subject.trim();
  const upperSub = normalized.toUpperCase();
  
  if (upperSub.includes('HĐTN') || upperSub.includes('HDTN')) {
    return 'HĐTN';
  } 
  if (upperSub.includes('NDGĐP') || upperSub.includes('NDGDĐP') || upperSub.includes('GDĐP')) {
    return 'NDGĐP';
  }
  if (upperSub.includes('QPAN')) {
    return '';
  }
  
  // Handle KHTN subjects
  if (upperSub.includes('KHTN')) {
    if (upperSub.includes('1')) return 'Lý';
    if (upperSub.includes('2')) return 'Hóa';
    if (upperSub.includes('3')) return 'Sinh';
    return 'KHTN';
  }

  // Normalize Lý, Hóa, Sinh
  if (upperSub === 'VẬT LÝ' || upperSub === 'VẬT LÍ' || upperSub === 'LÍ') return 'Lý';
  if (upperSub === 'HÓA HỌC') return 'Hóa';
  if (upperSub === 'SINH HỌC') return 'Sinh';

  // Handle Nghệ thuật subjects
  if (upperSub.includes('NGHỆ THUẬT') || upperSub.includes('NGHE THUAT')) {
    if (upperSub.includes('MT') || upperSub.includes('MỸ THUẬT')) {
      return 'Mỹ thuật';
    }
    if (upperSub.match(/[- ]N\b/) || upperSub.match(/\bN\b/) || upperSub.includes('ÂM NHẠC')) {
      return 'Âm nhạc';
    }
  }
  
  return normalized;
};

// ============================================================================
// 2. HÀM GIAO DIỆN HIỂN THỊ (Dùng để làm đẹp ảnh Zalo và Tag Giáo viên)
// ============================================================================
export const formatSubjectName = (rawSubject: string, mode: 'short' | 'full' = 'full'): string => {
  if (!rawSubject) return '';
  
  return rawSubject.split(',').map(s => {
    let t = s.trim();
    const upperT = t.toUpperCase();
    
    // 1. Nhóm Hoạt động trải nghiệm
    if (upperT.includes('HĐTN') || upperT.includes('HDTN') || upperT.includes('CC-') || upperT.includes('CHÀO CỜ') || upperT.includes('SHL') || upperT.includes('SINH HOẠT')) {
      return mode === 'short' ? 'HĐTN' : 'Hoạt động trải nghiệm, hướng nghiệp';
    }
    
    // 2. Nhóm Nghệ thuật
    if (upperT.includes('NGHỆ THUẬT(M)') || upperT.includes('NGHỆ THUẬT - MT') || upperT === 'MT' || upperT.includes('MỸ THUẬT')) {
      return mode === 'short' ? 'Nghệ thuật(M)' : 'NT(Mỹ thuật)';
    }
    if (upperT.includes('NGHỆ THUẬT(A)') || upperT.includes('NGHỆ THUẬT - N') || upperT === 'ÂN' || upperT.includes('ÂM NHẠC')) {
      return mode === 'short' ? 'Nghệ thuật(A)' : 'NT(Âm nhạc)';
    }
    if (upperT.includes('NGHỆ THUẬT')) return 'Nghệ thuật';
    
    // 3. Nhóm Khoa học Tự nhiên
    if (upperT.includes('KHOA HỌC TỰ NHIÊN(L)') || upperT.includes('KHTN1') || upperT === 'LÝ') {
      return mode === 'short' ? 'KHTN(L)' : 'KHTN (Vật lí)';
    }
    if (upperT.includes('KHOA HỌC TỰ NHIÊN(H)') || upperT.includes('KHTN2') || upperT === 'HÓA') {
      return mode === 'short' ? 'KHTN(H)' : 'KHTN (Hóa học)';
    }
    if (upperT.includes('KHOA HỌC TỰ NHIÊN(S)') || upperT.includes('KHTN3') || upperT === 'SINH') {
      return mode === 'short' ? 'KHTN(S)' : 'KHTN (Sinh học)';
    }
    if (upperT === 'KHTN') return 'Khoa học Tự nhiên';

    // 4. Nhóm Lịch sử và Địa lí
    if (upperT.includes('LỊCH SỬ VÀ ĐỊA LÝ(S)') || upperT.includes('LỊCH SỬ VÀ ĐỊA LÍ(S)') || upperT === 'SỬ') {
      return mode === 'short' ? 'LSĐL(S)' : 'LS & ĐL (Lịch sử)';
    }
    if (upperT.includes('LỊCH SỬ VÀ ĐỊA LÝ(Đ)') || upperT.includes('LỊCH SỬ VÀ ĐỊA LÍ(Đ)') || upperT.includes('LỊCH SỬ VÀ ĐỊA LÝ (Đ)') || upperT === 'ĐỊA') {
      return mode === 'short' ? 'LSĐL(Đ)' : 'LS & ĐL (Địa lí)';
    }
    
    // 5. Nhóm GD Địa phương
    if (upperT.includes('NDGDĐP') || upperT.includes('GDĐP') || upperT.includes('NDGĐP')) {
      return mode === 'short' ? 'GDĐP' : 'GD Địa phương';
    }

    // 6. Các môn khác
    const mapFull: Record<string, string> = {
      'VĂN': 'Ngữ văn',
      'AVĂN': 'Tiếng Anh',
      'ANH': 'Tiếng Anh',
      'CNGHỆ': 'Công nghệ',
      'TIN': 'Tin học',
      'GDCD': 'Giáo dục Công dân',
      'GDTC': 'Giáo dục Thể chất',
      'TOÁN': 'Toán'
    };

    const mapShort: Record<string, string> = {
      'VĂN': 'Văn',
      'AVĂN': 'Ngoại ngữ',
      'ANH': 'Ngoại ngữ',
      'CNGHỆ': 'Công nghệ',
      'TIN': 'Tin',
      'GDCD': 'GDCD',
      'GDTC': 'GDTC',
      'TOÁN': 'Toán'
    };
    
    // Khớp tương đối
    for (const key in mapFull) {
      if (upperT.includes(key) || upperT === key) {
        return mode === 'short' ? mapShort[key] : mapFull[key];
      }
    }
    
    return t; 
  }).join(', ');
};

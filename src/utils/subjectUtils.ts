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

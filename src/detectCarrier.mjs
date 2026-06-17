export const carriers = [
  {
    id: 'phone',
    name: 'Số điện thoại',
    shortName: 'SĐT',
    hotline: '',
    email: '',
    hours: '',
    patterns: [/^\d{9,11}$/],
  },
  {
    id: 'ghn',
    name: 'Giao Hàng Nhanh',
    shortName: 'GHN',
    hotline: '1900 636 677',
    email: 'cskh@ghn.vn',
    hours: '8h - 20h',
    patterns: [/^[A-Z0-9._-]{4,40}$/i],
  },
];

const unknownCarrier = {
  id: 'unknown',
  name: 'Không nhận diện được mã GHN',
  shortName: 'Không rõ',
  hotline: '',
  email: '',
  hours: '',
  confidence: 'low',
};

export function detectCarrier(rawCode) {
  const code = String(rawCode ?? '').trim().replace(/\s+/g, '').toUpperCase();

  if (!code) {
    return { ...unknownCarrier, code: '', confidence: 'empty' };
  }

  const carrier = carriers.find((candidate) =>
    candidate.patterns.some((pattern) => pattern.test(code)),
  );

  if (!carrier) {
    return { ...unknownCarrier, code, confidence: 'low' };
  }

  return {
    ...carrier,
    code,
    confidence: 'high',
  };
}

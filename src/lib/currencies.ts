export interface CurrencyInfo {
  code: string;
  name: string;
  nameZh: string;
  nameLocal?: string;
  symbol: string;
  primaryColor?: string;
}

export const SUPPORTED_CURRENCIES: CurrencyInfo[] = [
 { code: 'CNY', name: 'Chinese Yuan', nameZh: '人民币', nameLocal: '人民币', symbol: '¥', primaryColor: '#C8102E' },
  { code: 'MYR', name: 'Malaysian Ringgit', nameZh: '马来西亚林吉特', nameLocal: 'Ringgit Malaysia', symbol: 'RM', primaryColor: '#1B4D8E' },
  { code: 'USD', name: 'US Dollar', nameZh: '美元', nameLocal: 'US Dollar', symbol: '$', primaryColor: '#228B22' },
  { code: 'EUR', name: 'Euro', nameZh: '欧元', nameLocal: 'Euro', symbol: '€', primaryColor: '#003399' },
  { code: 'GBP', name: 'British Pound', nameZh: '英镑', nameLocal: 'British Pound', symbol: '£', primaryColor: '#8B4513' },
  { code: 'JPY', name: 'Japanese Yen', nameZh: '日元', nameLocal: '日本円', symbol: '¥', primaryColor: '#8B0000' },
  { code: 'KRW', name: 'South Korean Won', nameZh: '韩元', nameLocal: '대한민국 원', symbol: '₩', primaryColor: '#0067A3' },
  { code: 'AUD', name: 'Australian Dollar', nameZh: '澳元', nameLocal: 'Australian Dollar', symbol: 'A$', primaryColor: '#00843D' },
  { code: 'CAD', name: 'Canadian Dollar', nameZh: '加元', nameLocal: 'Canadian Dollar', symbol: 'C$', primaryColor: '#8B0000' },
  { code: 'CHF', name: 'Swiss Franc', nameZh: '瑞士法郎', nameLocal: 'Schweizer Franken', symbol: 'Fr', primaryColor: '#FF0000' },
  { code: 'HKD', name: 'Hong Kong Dollar', nameZh: '港币', nameLocal: '港币', symbol: 'HK$', primaryColor: '#008040' },
  { code: 'SGD', name: 'Singapore Dollar', nameZh: '新加坡元', nameLocal: 'Singapore Dollar', symbol: 'S$', primaryColor: '#008040' },
  { code: 'SEK', name: 'Swedish Krona', nameZh: '瑞典克朗', nameLocal: 'Svensk krona', symbol: 'kr', primaryColor: '#006AA7' },
  { code: 'NOK', name: 'Norwegian Krone', nameZh: '挪威克朗', nameLocal: 'Norsk krone', symbol: 'kr', primaryColor: '#BA0C2F' },
  { code: 'DKK', name: 'Danish Krone', nameZh: '丹麦克朗', nameLocal: 'Dansk krone', symbol: 'kr', primaryColor: '#C60C30' },
  { code: 'NZD', name: 'New Zealand Dollar', nameZh: '新西兰元', nameLocal: 'New Zealand Dollar', symbol: 'NZ$', primaryColor: '#008040' },
  { code: 'THB', name: 'Thai Baht', nameZh: '泰铢', nameLocal: 'บาทไทย', symbol: '฿', primaryColor: '#8B0000' },
  { code: 'INR', name: 'Indian Rupee', nameZh: '印度卢比', nameLocal: 'भारतीय रुपया', symbol: '₹', primaryColor: '#FF9933' },
  { code: 'IDR', name: 'Indonesian Rupiah', nameZh: '印尼盾', nameLocal: 'Rupiah Indonesia', symbol: 'Rp', primaryColor: '#FF0000' },
  { code: 'PHP', name: 'Philippine Peso', nameZh: '菲律宾比索', nameLocal: 'Piso ng Pilipinas', symbol: '₱', primaryColor: '#0038A8' },
  { code: 'PLN', name: 'Polish Zloty', nameZh: '波兰兹罗提', nameLocal: 'Polski złoty', symbol: 'zł', primaryColor: '#DC143C' },
  { code: 'CZK', name: 'Czech Koruna', nameZh: '捷克克朗', nameLocal: 'Česká koruna', symbol: 'Kč', primaryColor: '#11457E' },
  { code: 'HUF', name: 'Hungarian Forint', nameZh: '匈牙利福林', nameLocal: 'Magyar forint', symbol: 'Ft', primaryColor: '#CE2939' },
  { code: 'RON', name: 'Romanian Leu', nameZh: '罗马尼亚列伊', nameLocal: 'Leu românesc', symbol: 'lei', primaryColor: '#002B7F' },
  { code: 'TRY', name: 'Turkish Lira', nameZh: '土耳其里拉', nameLocal: 'Türk Lirası', symbol: '₺', primaryColor: '#E30A17' },
  { code: 'BRL', name: 'Brazilian Real', nameZh: '巴西雷亚尔', nameLocal: 'Real brasileiro', symbol: 'R$', primaryColor: '#009739' },
  { code: 'MXN', name: 'Mexican Peso', nameZh: '墨西哥比索', nameLocal: 'Peso mexicano', symbol: 'Mex$', primaryColor: '#006847' },
];

export function getCurrencySymbol(code: string): string {
  return SUPPORTED_CURRENCIES.find(c => c.code === code)?.symbol || code;
}

export function getCurrencyInfo(code: string): CurrencyInfo | undefined {
  return SUPPORTED_CURRENCIES.find(c => c.code === code);
}

export function formatAmount(amount: number, currency: string): string {
  const symbol = getCurrencySymbol(currency);
  return `${symbol}${amount.toFixed(2)}`;
}

export function getCurrencyPrimaryColor(code: string): string {
  return SUPPORTED_CURRENCIES.find(c => c.code === code)?.primaryColor || '#64748b';
}

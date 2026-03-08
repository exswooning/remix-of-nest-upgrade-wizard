// Number to Nepali-style English words (supports up to 99,99,99,999)
const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
  'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function twoDigits(n: number): string {
  if (n < 20) return ones[n];
  return tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : '');
}

function threeDigits(n: number): string {
  if (n === 0) return '';
  if (n < 100) return twoDigits(n);
  return ones[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' ' + twoDigits(n % 100) : '');
}

export function numberToWords(num: number): string {
  if (isNaN(num) || num <= 0) return '';
  if (num === 0) return 'Zero';

  const n = Math.floor(num);
  if (n >= 1_00_00_00_000) return n.toLocaleString(); // too large

  let result = '';
  const crore = Math.floor(n / 1_00_00_000);
  const lakh = Math.floor((n % 1_00_00_000) / 1_00_000);
  const thousand = Math.floor((n % 1_00_000) / 1_000);
  const remainder = n % 1_000;

  if (crore) result += threeDigits(crore) + ' Crore ';
  if (lakh) result += twoDigits(lakh) + ' Lakh ';
  if (thousand) result += twoDigits(thousand) + ' Thousand ';
  if (remainder) result += threeDigits(remainder);

  return result.trim() + ' Only';
}

// Convert period number string to text
const periodMap: Record<string, string> = {
  '1': 'One Month', '2': 'Two Months', '3': 'Three Months',
  '4': 'Four Months', '5': 'Five Months', '6': 'Six Months',
  '7': 'Seven Months', '8': 'Eight Months', '9': 'Nine Months',
  '10': 'Ten Months', '11': 'Eleven Months', '12': 'One Year',
  '18': 'One and a Half Years', '24': 'Two Years', '36': 'Three Years',
  '48': 'Four Years', '60': 'Five Years',
};

export function periodToText(numStr: string): string {
  const cleaned = numStr.replace(/[^0-9]/g, '');
  if (!cleaned) return '';
  if (periodMap[cleaned]) return periodMap[cleaned];
  const n = parseInt(cleaned);
  if (n > 12 && n % 12 === 0) {
    const years = n / 12;
    return `${numberToWords(years).replace(' Only', '')} Year${years > 1 ? 's' : ''}`;
  }
  return `${numberToWords(n).replace(' Only', '')} Month${n > 1 ? 's' : ''}`;
}

// Extract company abbreviation from contract ID (format: ABV-NNBS-...)
export function extractCompanyAbv(contractId: string): string {
  const parts = contractId.split('-');
  return parts[0]?.toUpperCase() || '';
}

// Get today formatted
export function getTodayISO(): string {
  return new Date().toISOString().split('T')[0];
}

// Generate abbreviation from company name (first letter of each significant word)
export function generateAbbreviation(companyName: string): string {
  if (!companyName.trim()) return '';
  const skip = new Set(['pvt', 'pvt.', 'ltd', 'ltd.', 'private', 'limited', 'co', 'co.', 'and', 'the', 'of', 'for', 'in', 'a', 'an']);
  const words = companyName.trim().split(/\s+/).filter(w => !skip.has(w.toLowerCase()));
  if (words.length === 0) return companyName.trim().charAt(0).toUpperCase();
  return words.map(w => w.charAt(0).toUpperCase()).join('');
}

// Format number with commas (Nepali style: 1,00,000)
export function formatNepaliNumber(num: number): string {
  if (isNaN(num)) return '';
  const str = Math.floor(num).toString();
  if (str.length <= 3) return str;
  let last3 = str.slice(-3);
  let rest = str.slice(0, -3);
  let formatted = '';
  while (rest.length > 2) {
    formatted = ',' + rest.slice(-2) + formatted;
    rest = rest.slice(0, -2);
  }
  return rest + formatted + ',' + last3;
}

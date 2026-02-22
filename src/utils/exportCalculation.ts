import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

interface ProRataExportData {
  type: 'prorata';
  userCount: number;
  pricePerUser: number;
  elapsedDays: number;
  totalMonths: number;
  totalProRataCost: number;
  vatAmount: number;
  totalWithVat: number;
  subscriptionStartDate: string;
  userAdditionDate: string;
  product?: string;
}

interface UpgradeExportData {
  type: 'upgrade';
  currentPlan: string;
  targetPlan: string;
  startDate: string;
  endDate: string;
  usedDays: number;
  totalDays: number;
  moneyPerDay: number;
  usedMoney: number;
  remainingAmount: number;
  newPackageFullAmount: number;
  upgradeAmount: number;
}

export interface VpsExportData {
  type: 'vps';
  cpuCores: number;
  ramGB: number;
  storageGB: number;
  managementFee: number;
  discountPct: number;
  resourceSubtotal: number;
  totalMonthlyBase: number;
  monthlyVat: number;
  totalBeforeDiscount: number;
  discountAmount: number;
  monthlyTotal: number;
  annualTotal: number;
  annualResourceCost: number;
  annualManagementFee: number;
  annualVat: number;
}

type ExportData = ProRataExportData | UpgradeExportData | VpsExportData;

const formatCurrency = (amount: number) => {
  return `NPR ${amount.toLocaleString('en-NP', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
};

export const exportToPDF = async (data: ExportData) => {
  const pdf = new jsPDF('p', 'mm', 'a4');
  const pageWidth = pdf.internal.pageSize.getWidth();
  
  // Header
  pdf.setFillColor(59, 130, 246);
  pdf.rect(0, 0, pageWidth, 30, 'F');
  pdf.setTextColor(255, 255, 255);
  pdf.setFontSize(18);
  pdf.setFont('helvetica', 'bold');
  
  const title = data.type === 'prorata' ? 'Pro Rata User Addition' : data.type === 'vps' ? 'VPS Pricing Summary' : 'Amount Due For Upgrade';
  pdf.text(title, pageWidth / 2, 18, { align: 'center' });
  
  // Reset text color
  pdf.setTextColor(0, 0, 0);
  pdf.setFontSize(10);
  pdf.setFont('helvetica', 'normal');
  
  // Date generated
  pdf.text(`Generated: ${new Date().toLocaleDateString('en-GB')}`, 14, 40);
  
  let yPos = 55;
  
  if (data.type === 'prorata') {
    // Pro Rata Table
    const tableData = [
      ['Start Date', data.subscriptionStartDate],
      ['User Addition Date', data.userAdditionDate],
      ['Number of Users', data.userCount.toString()],
      ['Price per User', formatCurrency(data.pricePerUser)],
      ['Days Elapsed', `${data.elapsedDays} days`],
      ['Calendar Months (Inclusive)', `${data.totalMonths} month${data.totalMonths !== 1 ? 's' : ''}`],
    ];
    
    // Draw table header
    pdf.setFillColor(229, 231, 235);
    pdf.rect(14, yPos, pageWidth - 28, 10, 'F');
    pdf.setFont('helvetica', 'bold');
    pdf.text('Description', 20, yPos + 7);
    pdf.text('Value', pageWidth - 60, yPos + 7);
    yPos += 12;
    
    // Draw table rows
    pdf.setFont('helvetica', 'normal');
    tableData.forEach((row, index) => {
      if (index % 2 === 0) {
        pdf.setFillColor(249, 250, 251);
        pdf.rect(14, yPos - 2, pageWidth - 28, 10, 'F');
      }
      pdf.text(row[0], 20, yPos + 5);
      pdf.text(row[1], pageWidth - 60, yPos + 5);
      yPos += 10;
    });
    
    // Calculation formula
    yPos += 5;
    pdf.setFillColor(239, 246, 255);
    pdf.rect(14, yPos, pageWidth - 28, 12, 'F');
    pdf.setFontSize(9);
    pdf.text(`Calculation: ${formatCurrency(data.pricePerUser)} × ${data.totalMonths} months × ${data.userCount} user${data.userCount !== 1 ? 's' : ''}`, 20, yPos + 8);
    yPos += 18;
    
    // Subtotal
    pdf.setFillColor(16, 185, 129);
    pdf.rect(14, yPos, pageWidth - 28, 12, 'F');
    pdf.setTextColor(255, 255, 255);
    pdf.setFontSize(11);
    pdf.setFont('helvetica', 'bold');
    pdf.text('Subtotal (Before VAT):', 20, yPos + 8);
    pdf.text(formatCurrency(data.totalProRataCost), pageWidth - 60, yPos + 8);
    yPos += 14;
    
    // VAT
    pdf.setTextColor(0, 0, 0);
    pdf.setFillColor(249, 250, 251);
    pdf.rect(14, yPos, pageWidth - 28, 10, 'F');
    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'normal');
    pdf.text('VAT (13%):', 20, yPos + 7);
    pdf.text(formatCurrency(data.vatAmount), pageWidth - 60, yPos + 7);
    yPos += 12;
    
    // Total with VAT
    pdf.setFillColor(5, 150, 105);
    pdf.rect(14, yPos, pageWidth - 28, 14, 'F');
    pdf.setTextColor(255, 255, 255);
    pdf.setFontSize(12);
    pdf.setFont('helvetica', 'bold');
    pdf.text('Total with VAT:', 20, yPos + 9);
    pdf.text(formatCurrency(data.totalWithVat), pageWidth - 60, yPos + 9);
    
  } else if (data.type === 'upgrade') {
    // Upgrade Table
    const tableData = [
      ['Current Plan', data.currentPlan],
      ['Target Plan', data.targetPlan],
      ['Start Date', data.startDate],
      ['End Date', data.endDate],
      ['Used Days', `${data.usedDays} of ${data.totalDays} days`],
      ['Usage Percentage', `${((data.usedDays / data.totalDays) * 100).toFixed(1)}%`],
      ['Daily Cost', formatCurrency(data.moneyPerDay)],
      ['Used Money', formatCurrency(data.usedMoney)],
      ['Remaining Amount', formatCurrency(data.remainingAmount)],
      ['New Package Full Amount', formatCurrency(data.newPackageFullAmount)],
    ];
    
    // Draw table header
    pdf.setFillColor(229, 231, 235);
    pdf.rect(14, yPos, pageWidth - 28, 10, 'F');
    pdf.setFont('helvetica', 'bold');
    pdf.text('Description', 20, yPos + 7);
    pdf.text('Value', pageWidth - 60, yPos + 7);
    yPos += 12;
    
    // Draw table rows
    pdf.setFont('helvetica', 'normal');
    tableData.forEach((row, index) => {
      if (index % 2 === 0) {
        pdf.setFillColor(249, 250, 251);
        pdf.rect(14, yPos - 2, pageWidth - 28, 10, 'F');
      }
      pdf.text(row[0], 20, yPos + 5);
      pdf.text(row[1], pageWidth - 60, yPos + 5);
      yPos += 10;
    });
    
    // Total
    yPos += 5;
    pdf.setFillColor(249, 115, 22);
    pdf.rect(14, yPos, pageWidth - 28, 14, 'F');
    pdf.setTextColor(255, 255, 255);
    pdf.setFontSize(12);
    pdf.setFont('helvetica', 'bold');
    pdf.text('Final Upgrade Cost:', 20, yPos + 9);
    pdf.text(formatCurrency(data.upgradeAmount), pageWidth - 60, yPos + 9);
  } else if (data.type === 'vps') {
    // VPS Table
    const tableData = [
      ['CPU Cores', `${data.cpuCores} cores`],
      ['RAM', `${data.ramGB} GB`],
      ['Storage', `${data.storageGB} GB`],
      ['Monthly Resource Cost', formatCurrency(data.resourceSubtotal)],
      ['Monthly Management Fee', formatCurrency(data.managementFee)],
      ['Total Monthly Base', formatCurrency(data.totalMonthlyBase)],
      ['VAT (13%)', formatCurrency(data.monthlyVat)],
      ['Total Monthly (Incl. VAT)', formatCurrency(data.totalBeforeDiscount)],
    ];

    if (data.discountPct > 0) {
      tableData.push([`Discount (${data.discountPct}%)`, `-${formatCurrency(data.discountAmount)}`]);
    }

    tableData.push(['Monthly Grand Total', formatCurrency(data.monthlyTotal)]);

    // Draw table header
    pdf.setFillColor(229, 231, 235);
    pdf.rect(14, yPos, pageWidth - 28, 10, 'F');
    pdf.setFont('helvetica', 'bold');
    pdf.text('Description', 20, yPos + 7);
    pdf.text('Value', pageWidth - 60, yPos + 7);
    yPos += 12;

    // Draw table rows
    pdf.setFont('helvetica', 'normal');
    tableData.forEach((row, index) => {
      if (index % 2 === 0) {
        pdf.setFillColor(249, 250, 251);
        pdf.rect(14, yPos - 2, pageWidth - 28, 10, 'F');
      }
      pdf.text(row[0], 20, yPos + 5);
      pdf.text(row[1], pageWidth - 60, yPos + 5);
      yPos += 10;
    });

    // Annual Breakdown
    yPos += 8;
    pdf.setFillColor(229, 231, 235);
    pdf.rect(14, yPos, pageWidth - 28, 10, 'F');
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(10);
    pdf.text('Annual Breakdown', 20, yPos + 7);
    yPos += 12;

    const annualData = [
      ['Annual Resource Cost', formatCurrency(data.annualResourceCost)],
      ['Annual Management Fee', formatCurrency(data.annualManagementFee)],
      ['Annual VAT (13%)', formatCurrency(data.annualVat)],
    ];

    if (data.discountPct > 0) {
      annualData.push([`Annual Discount (${data.discountPct}%)`, `-${formatCurrency(data.discountAmount * 12)}`]);
    }

    pdf.setFont('helvetica', 'normal');
    annualData.forEach((row, index) => {
      if (index % 2 === 0) {
        pdf.setFillColor(249, 250, 251);
        pdf.rect(14, yPos - 2, pageWidth - 28, 10, 'F');
      }
      pdf.text(row[0], 20, yPos + 5);
      pdf.text(row[1], pageWidth - 60, yPos + 5);
      yPos += 10;
    });

    // Final Annual Total
    yPos += 3;
    pdf.setFillColor(16, 185, 129);
    pdf.rect(14, yPos, pageWidth - 28, 14, 'F');
    pdf.setTextColor(255, 255, 255);
    pdf.setFontSize(12);
    pdf.setFont('helvetica', 'bold');
    pdf.text('Final Annual Commitment:', 20, yPos + 9);
    pdf.text(formatCurrency(data.annualTotal), pageWidth - 60, yPos + 9);
  }
  
  // Footer
  pdf.setTextColor(128, 128, 128);
  pdf.setFontSize(8);
  pdf.setFont('helvetica', 'normal');
  pdf.text('This is a system-generated calculation document.', pageWidth / 2, 280, { align: 'center' });
  
  // Save
  let filename: string;
  if (data.type === 'prorata') {
    filename = `prorata-calculation-${new Date().toISOString().split('T')[0]}.pdf`;
  } else if (data.type === 'upgrade') {
    filename = `upgrade-calculation-${new Date().toISOString().split('T')[0]}.pdf`;
  } else {
    filename = `vps-pricing-${new Date().toISOString().split('T')[0]}.pdf`;
  }
  pdf.save(filename);
};

export const exportToImage = async (elementId: string, filename: string) => {
  const element = document.getElementById(elementId);
  if (!element) return;
  
  const canvas = await html2canvas(element, {
    backgroundColor: '#ffffff',
    scale: 2,
  });
  
  const link = document.createElement('a');
  link.download = `${filename}-${new Date().toISOString().split('T')[0]}.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
};

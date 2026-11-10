import * as XLSX from 'xlsx';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** Download a workbook using the browser's standard Blob/download path. */
export function downloadXlsx(workbook: XLSX.WorkBook, filename: string) {
  const data = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' });
  const url = URL.createObjectURL(new Blob([data], { type: XLSX_MIME }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

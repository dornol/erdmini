import type { ERDSchema } from '$lib/types/erd';
import { exportSvg } from './svg-export';
import { sanitizeFilename } from './common';

export async function exportPdf(schema: ERDSchema, themeId: string, filename: string): Promise<void> {
  const svgString = exportSvg(schema, themeId);
  if (!svgString) return;

  // Parse width/height from SVG
  const widthMatch = svgString.match(/width="(\d+)"/);
  const heightMatch = svgString.match(/height="(\d+)"/);
  const svgWidth = widthMatch ? parseInt(widthMatch[1]) : 800;
  const svgHeight = heightMatch ? parseInt(heightMatch[1]) : 600;

  // Determine orientation
  const orientation = svgWidth >= svgHeight ? 'landscape' : 'portrait';

  // Dynamic imports
  const { jsPDF } = await import('jspdf');
  await import('svg2pdf.js'); // side-effect: extends jsPDF prototype

  const pdf = new jsPDF({
    orientation,
    unit: 'pt',
    format: [svgWidth, svgHeight],
  });

  // Parse SVG string to DOM element
  const parser = new DOMParser();
  const svgDoc = parser.parseFromString(svgString, 'image/svg+xml');
  const svgEl = svgDoc.documentElement;

  // Render SVG to PDF
  await (pdf as any).svg(svgEl, {
    x: 0,
    y: 0,
    width: svgWidth,
    height: svgHeight,
  });

  pdf.save(sanitizeFilename(filename) + '.pdf');
}

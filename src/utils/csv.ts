/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// A simple, robust client-side CSV parser
export interface ParsedCSV {
  headers: string[];
  rows: Record<string, string>[];
}

export function parseCSV(text: string): ParsedCSV {
  const lines = text.split(/\r?\n/);
  if (lines.length === 0) return { headers: [], rows: [] };

  // Detect delimiter (comma or semicolon)
  const firstLine = lines[0];
  const commaCount = (firstLine.match(/,/g) || []).length;
  const semiCount = (firstLine.match(/;/g) || []).length;
  const tabCount = (firstLine.match(/\t/g) || []).length;
  
  let delimiter = ",";
  if (semiCount > commaCount) delimiter = ";";
  if (tabCount > semiCount && tabCount > commaCount) delimiter = "\t";

  // Parse strings with potential quotes
  const parseLine = (line: string): string[] => {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"' || char === "'") {
        inQuotes = !inQuotes;
      } else if (char === delimiter && !inQuotes) {
        result.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  };

  const rawHeaders = parseLine(lines[0]);
  const headers = rawHeaders.map(h => h.trim().replace(/^['"]|['"]$/g, ""));
  
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const parsed = parseLine(line);
    const row: Record<string, string> = {};
    headers.forEach((header, index) => {
      let val = parsed[index] || "";
      // Strip outer quotes if any
      val = val.trim().replace(/^['"]|['"]$/g, "");
      row[header] = val;
    });
    rows.push(row);
  }

  return { headers, rows };
}

// Helper to extract numeric Zone ID from varying strings (e.g. "2092300----", "[2092300]", or just "2092300")
export function extractZoneId(value: string): string {
  if (!value) return "";
  // Look for the first sequence of numbers (at least 4 digits long typically, or just search all digits)
  const match = value.match(/\d+/);
  return match ? match[0] : value.trim();
}

// Robust number parser
export function parseNumber(value: any): number {
  if (value === undefined || value === null) return 0;
  if (typeof value === "number") return value;
  
  // Strip thousands separators and normalize decimals
  // E.g., Indonesian formatting: "1.500.000,00" or English "1,500,000.00"
  let cleanStr = String(value).trim().replace(/[^0-9,.-]/g, "");
  
  // If we have both commas and periods, find which is the decimal
  const firstComma = cleanStr.indexOf(",");
  const firstPeriod = cleanStr.indexOf(".");
  
  if (firstComma !== -1 && firstPeriod !== -1) {
    if (firstComma > firstPeriod) {
      // period is thousand separator, comma is decimal
      cleanStr = cleanStr.replace(/\./g, "").replace(/,/g, ".");
    } else {
      // comma is thousand separator, period is decimal
      cleanStr = cleanStr.replace(/,/g, "");
    }
  } else if (firstComma !== -1) {
    // Only comma present. Check if it looks like a decimal (e.g., length - 3) or thousands
    // E.g. "1200,50" -> 1200.50, but "1,200" is probably 1200
    const parts = cleanStr.split(",");
    if (parts[parts.length - 1].length === 2 || parts[parts.length - 1].length === 1) {
      cleanStr = cleanStr.replace(/,/g, ".");
    } else {
      cleanStr = cleanStr.replace(/,/g, "");
    }
  }
  
  const parsed = parseFloat(cleanStr);
  return isNaN(parsed) ? 0 : parsed;
}

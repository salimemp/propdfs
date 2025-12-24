// ==================== REGIONAL TAX CALCULATION SERVICE ====================
// Supports US state taxes, EU VAT, Canadian GST/HST/PST, and other regions

export interface TaxRate {
  region: string;
  country: string;
  state?: string;
  rate: number;
  name: string;
  type: "sales" | "vat" | "gst" | "hst" | "pst" | "qst";
}

export interface TaxCalculation {
  subtotal: number;
  taxAmount: number;
  total: number;
  breakdown: TaxBreakdown[];
  currency: string;
  region: string;
}

export interface TaxBreakdown {
  name: string;
  rate: number;
  amount: number;
  type: string;
}

// ==================== US STATE TAX RATES ====================
const US_STATE_TAX_RATES: Record<string, TaxRate> = {
  AL: { region: "US-AL", country: "US", state: "AL", rate: 0.04, name: "Alabama Sales Tax", type: "sales" },
  AK: { region: "US-AK", country: "US", state: "AK", rate: 0.00, name: "Alaska (No State Tax)", type: "sales" },
  AZ: { region: "US-AZ", country: "US", state: "AZ", rate: 0.056, name: "Arizona Sales Tax", type: "sales" },
  AR: { region: "US-AR", country: "US", state: "AR", rate: 0.065, name: "Arkansas Sales Tax", type: "sales" },
  CA: { region: "US-CA", country: "US", state: "CA", rate: 0.0725, name: "California Sales Tax", type: "sales" },
  CO: { region: "US-CO", country: "US", state: "CO", rate: 0.029, name: "Colorado Sales Tax", type: "sales" },
  CT: { region: "US-CT", country: "US", state: "CT", rate: 0.0635, name: "Connecticut Sales Tax", type: "sales" },
  DE: { region: "US-DE", country: "US", state: "DE", rate: 0.00, name: "Delaware (No Sales Tax)", type: "sales" },
  FL: { region: "US-FL", country: "US", state: "FL", rate: 0.06, name: "Florida Sales Tax", type: "sales" },
  GA: { region: "US-GA", country: "US", state: "GA", rate: 0.04, name: "Georgia Sales Tax", type: "sales" },
  HI: { region: "US-HI", country: "US", state: "HI", rate: 0.04, name: "Hawaii General Excise Tax", type: "sales" },
  ID: { region: "US-ID", country: "US", state: "ID", rate: 0.06, name: "Idaho Sales Tax", type: "sales" },
  IL: { region: "US-IL", country: "US", state: "IL", rate: 0.0625, name: "Illinois Sales Tax", type: "sales" },
  IN: { region: "US-IN", country: "US", state: "IN", rate: 0.07, name: "Indiana Sales Tax", type: "sales" },
  IA: { region: "US-IA", country: "US", state: "IA", rate: 0.06, name: "Iowa Sales Tax", type: "sales" },
  KS: { region: "US-KS", country: "US", state: "KS", rate: 0.065, name: "Kansas Sales Tax", type: "sales" },
  KY: { region: "US-KY", country: "US", state: "KY", rate: 0.06, name: "Kentucky Sales Tax", type: "sales" },
  LA: { region: "US-LA", country: "US", state: "LA", rate: 0.0445, name: "Louisiana Sales Tax", type: "sales" },
  ME: { region: "US-ME", country: "US", state: "ME", rate: 0.055, name: "Maine Sales Tax", type: "sales" },
  MD: { region: "US-MD", country: "US", state: "MD", rate: 0.06, name: "Maryland Sales Tax", type: "sales" },
  MA: { region: "US-MA", country: "US", state: "MA", rate: 0.0625, name: "Massachusetts Sales Tax", type: "sales" },
  MI: { region: "US-MI", country: "US", state: "MI", rate: 0.06, name: "Michigan Sales Tax", type: "sales" },
  MN: { region: "US-MN", country: "US", state: "MN", rate: 0.06875, name: "Minnesota Sales Tax", type: "sales" },
  MS: { region: "US-MS", country: "US", state: "MS", rate: 0.07, name: "Mississippi Sales Tax", type: "sales" },
  MO: { region: "US-MO", country: "US", state: "MO", rate: 0.04225, name: "Missouri Sales Tax", type: "sales" },
  MT: { region: "US-MT", country: "US", state: "MT", rate: 0.00, name: "Montana (No Sales Tax)", type: "sales" },
  NE: { region: "US-NE", country: "US", state: "NE", rate: 0.055, name: "Nebraska Sales Tax", type: "sales" },
  NV: { region: "US-NV", country: "US", state: "NV", rate: 0.0685, name: "Nevada Sales Tax", type: "sales" },
  NH: { region: "US-NH", country: "US", state: "NH", rate: 0.00, name: "New Hampshire (No Sales Tax)", type: "sales" },
  NJ: { region: "US-NJ", country: "US", state: "NJ", rate: 0.06625, name: "New Jersey Sales Tax", type: "sales" },
  NM: { region: "US-NM", country: "US", state: "NM", rate: 0.05125, name: "New Mexico Gross Receipts Tax", type: "sales" },
  NY: { region: "US-NY", country: "US", state: "NY", rate: 0.04, name: "New York Sales Tax", type: "sales" },
  NC: { region: "US-NC", country: "US", state: "NC", rate: 0.0475, name: "North Carolina Sales Tax", type: "sales" },
  ND: { region: "US-ND", country: "US", state: "ND", rate: 0.05, name: "North Dakota Sales Tax", type: "sales" },
  OH: { region: "US-OH", country: "US", state: "OH", rate: 0.0575, name: "Ohio Sales Tax", type: "sales" },
  OK: { region: "US-OK", country: "US", state: "OK", rate: 0.045, name: "Oklahoma Sales Tax", type: "sales" },
  OR: { region: "US-OR", country: "US", state: "OR", rate: 0.00, name: "Oregon (No Sales Tax)", type: "sales" },
  PA: { region: "US-PA", country: "US", state: "PA", rate: 0.06, name: "Pennsylvania Sales Tax", type: "sales" },
  RI: { region: "US-RI", country: "US", state: "RI", rate: 0.07, name: "Rhode Island Sales Tax", type: "sales" },
  SC: { region: "US-SC", country: "US", state: "SC", rate: 0.06, name: "South Carolina Sales Tax", type: "sales" },
  SD: { region: "US-SD", country: "US", state: "SD", rate: 0.045, name: "South Dakota Sales Tax", type: "sales" },
  TN: { region: "US-TN", country: "US", state: "TN", rate: 0.07, name: "Tennessee Sales Tax", type: "sales" },
  TX: { region: "US-TX", country: "US", state: "TX", rate: 0.0625, name: "Texas Sales Tax", type: "sales" },
  UT: { region: "US-UT", country: "US", state: "UT", rate: 0.061, name: "Utah Sales Tax", type: "sales" },
  VT: { region: "US-VT", country: "US", state: "VT", rate: 0.06, name: "Vermont Sales Tax", type: "sales" },
  VA: { region: "US-VA", country: "US", state: "VA", rate: 0.053, name: "Virginia Sales Tax", type: "sales" },
  WA: { region: "US-WA", country: "US", state: "WA", rate: 0.065, name: "Washington Sales Tax", type: "sales" },
  WV: { region: "US-WV", country: "US", state: "WV", rate: 0.06, name: "West Virginia Sales Tax", type: "sales" },
  WI: { region: "US-WI", country: "US", state: "WI", rate: 0.05, name: "Wisconsin Sales Tax", type: "sales" },
  WY: { region: "US-WY", country: "US", state: "WY", rate: 0.04, name: "Wyoming Sales Tax", type: "sales" },
  DC: { region: "US-DC", country: "US", state: "DC", rate: 0.06, name: "District of Columbia Sales Tax", type: "sales" },
};

// ==================== EU VAT RATES ====================
const EU_VAT_RATES: Record<string, TaxRate> = {
  AT: { region: "EU-AT", country: "AT", rate: 0.20, name: "Austria VAT", type: "vat" },
  BE: { region: "EU-BE", country: "BE", rate: 0.21, name: "Belgium VAT", type: "vat" },
  BG: { region: "EU-BG", country: "BG", rate: 0.20, name: "Bulgaria VAT", type: "vat" },
  HR: { region: "EU-HR", country: "HR", rate: 0.25, name: "Croatia VAT", type: "vat" },
  CY: { region: "EU-CY", country: "CY", rate: 0.19, name: "Cyprus VAT", type: "vat" },
  CZ: { region: "EU-CZ", country: "CZ", rate: 0.21, name: "Czech Republic VAT", type: "vat" },
  DK: { region: "EU-DK", country: "DK", rate: 0.25, name: "Denmark VAT", type: "vat" },
  EE: { region: "EU-EE", country: "EE", rate: 0.22, name: "Estonia VAT", type: "vat" },
  FI: { region: "EU-FI", country: "FI", rate: 0.24, name: "Finland VAT", type: "vat" },
  FR: { region: "EU-FR", country: "FR", rate: 0.20, name: "France VAT", type: "vat" },
  DE: { region: "EU-DE", country: "DE", rate: 0.19, name: "Germany VAT", type: "vat" },
  GR: { region: "EU-GR", country: "GR", rate: 0.24, name: "Greece VAT", type: "vat" },
  HU: { region: "EU-HU", country: "HU", rate: 0.27, name: "Hungary VAT", type: "vat" },
  IE: { region: "EU-IE", country: "IE", rate: 0.23, name: "Ireland VAT", type: "vat" },
  IT: { region: "EU-IT", country: "IT", rate: 0.22, name: "Italy VAT", type: "vat" },
  LV: { region: "EU-LV", country: "LV", rate: 0.21, name: "Latvia VAT", type: "vat" },
  LT: { region: "EU-LT", country: "LT", rate: 0.21, name: "Lithuania VAT", type: "vat" },
  LU: { region: "EU-LU", country: "LU", rate: 0.17, name: "Luxembourg VAT", type: "vat" },
  MT: { region: "EU-MT", country: "MT", rate: 0.18, name: "Malta VAT", type: "vat" },
  NL: { region: "EU-NL", country: "NL", rate: 0.21, name: "Netherlands VAT", type: "vat" },
  PL: { region: "EU-PL", country: "PL", rate: 0.23, name: "Poland VAT", type: "vat" },
  PT: { region: "EU-PT", country: "PT", rate: 0.23, name: "Portugal VAT", type: "vat" },
  RO: { region: "EU-RO", country: "RO", rate: 0.19, name: "Romania VAT", type: "vat" },
  SK: { region: "EU-SK", country: "SK", rate: 0.20, name: "Slovakia VAT", type: "vat" },
  SI: { region: "EU-SI", country: "SI", rate: 0.22, name: "Slovenia VAT", type: "vat" },
  ES: { region: "EU-ES", country: "ES", rate: 0.21, name: "Spain VAT", type: "vat" },
  SE: { region: "EU-SE", country: "SE", rate: 0.25, name: "Sweden VAT", type: "vat" },
  // UK post-Brexit
  GB: { region: "GB", country: "GB", rate: 0.20, name: "UK VAT", type: "vat" },
};

// ==================== CANADIAN TAX RATES ====================
interface CanadianTaxRate {
  gst?: number;
  hst?: number;
  pst?: number;
  qst?: number;
  province: string;
}

const CANADIAN_TAX_RATES: Record<string, CanadianTaxRate> = {
  AB: { province: "Alberta", gst: 0.05 },
  BC: { province: "British Columbia", gst: 0.05, pst: 0.07 },
  MB: { province: "Manitoba", gst: 0.05, pst: 0.07 },
  NB: { province: "New Brunswick", hst: 0.15 },
  NL: { province: "Newfoundland and Labrador", hst: 0.15 },
  NS: { province: "Nova Scotia", hst: 0.15 },
  NT: { province: "Northwest Territories", gst: 0.05 },
  NU: { province: "Nunavut", gst: 0.05 },
  ON: { province: "Ontario", hst: 0.13 },
  PE: { province: "Prince Edward Island", hst: 0.15 },
  QC: { province: "Quebec", gst: 0.05, qst: 0.09975 },
  SK: { province: "Saskatchewan", gst: 0.05, pst: 0.06 },
  YT: { province: "Yukon", gst: 0.05 },
};

// ==================== OTHER REGIONS ====================
const OTHER_TAX_RATES: Record<string, TaxRate> = {
  AU: { region: "AU", country: "AU", rate: 0.10, name: "Australia GST", type: "gst" },
  NZ: { region: "NZ", country: "NZ", rate: 0.15, name: "New Zealand GST", type: "gst" },
  SG: { region: "SG", country: "SG", rate: 0.09, name: "Singapore GST", type: "gst" },
  JP: { region: "JP", country: "JP", rate: 0.10, name: "Japan Consumption Tax", type: "vat" },
  KR: { region: "KR", country: "KR", rate: 0.10, name: "South Korea VAT", type: "vat" },
  IN: { region: "IN", country: "IN", rate: 0.18, name: "India GST", type: "gst" },
  BR: { region: "BR", country: "BR", rate: 0.17, name: "Brazil ICMS (avg)", type: "vat" },
  MX: { region: "MX", country: "MX", rate: 0.16, name: "Mexico IVA", type: "vat" },
  CH: { region: "CH", country: "CH", rate: 0.081, name: "Switzerland VAT", type: "vat" },
  NO: { region: "NO", country: "NO", rate: 0.25, name: "Norway VAT", type: "vat" },
};

// ==================== TAX EXEMPTION ====================
export interface TaxExemption {
  id: string;
  userId: number;
  exemptionType: "business" | "nonprofit" | "government" | "reseller";
  exemptionNumber: string;
  region: string;
  validFrom: Date;
  validUntil?: Date;
  isActive: boolean;
}

// In-memory exemption storage (in production, use database)
const exemptions: Map<number, TaxExemption[]> = new Map();

// ==================== TAX CALCULATION FUNCTIONS ====================

export function getUSStateTax(stateCode: string): TaxRate | null {
  return US_STATE_TAX_RATES[stateCode.toUpperCase()] || null;
}

export function getEUVATRate(countryCode: string): TaxRate | null {
  return EU_VAT_RATES[countryCode.toUpperCase()] || null;
}

export function getCanadianTax(provinceCode: string): CanadianTaxRate | null {
  return CANADIAN_TAX_RATES[provinceCode.toUpperCase()] || null;
}

export function getOtherRegionTax(countryCode: string): TaxRate | null {
  return OTHER_TAX_RATES[countryCode.toUpperCase()] || null;
}

export function calculateTax(options: {
  subtotal: number;
  country: string;
  state?: string;
  currency?: string;
  userId?: number;
}): TaxCalculation {
  const { subtotal, country, state, currency = "USD", userId } = options;
  const breakdown: TaxBreakdown[] = [];
  let taxAmount = 0;

  // Check for tax exemption
  if (userId) {
    const userExemptions = exemptions.get(userId) || [];
    const activeExemption = userExemptions.find(
      (e) => e.isActive && (!e.validUntil || e.validUntil > new Date())
    );
    if (activeExemption) {
      return {
        subtotal,
        taxAmount: 0,
        total: subtotal,
        breakdown: [{
          name: `Tax Exempt (${activeExemption.exemptionType})`,
          rate: 0,
          amount: 0,
          type: "exempt",
        }],
        currency,
        region: `${country}${state ? `-${state}` : ""}`,
      };
    }
  }

  // US Tax Calculation
  if (country.toUpperCase() === "US" && state) {
    const stateTax = getUSStateTax(state);
    if (stateTax && stateTax.rate > 0) {
      const amount = Math.round(subtotal * stateTax.rate * 100) / 100;
      taxAmount += amount;
      breakdown.push({
        name: stateTax.name,
        rate: stateTax.rate,
        amount,
        type: stateTax.type,
      });
    }
  }
  // EU VAT Calculation
  else if (EU_VAT_RATES[country.toUpperCase()]) {
    const vatRate = getEUVATRate(country);
    if (vatRate && vatRate.rate > 0) {
      const amount = Math.round(subtotal * vatRate.rate * 100) / 100;
      taxAmount += amount;
      breakdown.push({
        name: vatRate.name,
        rate: vatRate.rate,
        amount,
        type: vatRate.type,
      });
    }
  }
  // Canadian Tax Calculation
  else if (country.toUpperCase() === "CA" && state) {
    const canadianTax = getCanadianTax(state);
    if (canadianTax) {
      // HST provinces
      if (canadianTax.hst) {
        const amount = Math.round(subtotal * canadianTax.hst * 100) / 100;
        taxAmount += amount;
        breakdown.push({
          name: `${canadianTax.province} HST`,
          rate: canadianTax.hst,
          amount,
          type: "hst",
        });
      } else {
        // GST
        if (canadianTax.gst) {
          const gstAmount = Math.round(subtotal * canadianTax.gst * 100) / 100;
          taxAmount += gstAmount;
          breakdown.push({
            name: "Federal GST",
            rate: canadianTax.gst,
            amount: gstAmount,
            type: "gst",
          });
        }
        // PST
        if (canadianTax.pst) {
          const pstAmount = Math.round(subtotal * canadianTax.pst * 100) / 100;
          taxAmount += pstAmount;
          breakdown.push({
            name: `${canadianTax.province} PST`,
            rate: canadianTax.pst,
            amount: pstAmount,
            type: "pst",
          });
        }
        // QST (Quebec)
        if (canadianTax.qst) {
          const qstAmount = Math.round(subtotal * canadianTax.qst * 100) / 100;
          taxAmount += qstAmount;
          breakdown.push({
            name: "Quebec QST",
            rate: canadianTax.qst,
            amount: qstAmount,
            type: "qst",
          });
        }
      }
    }
  }
  // Other regions
  else {
    const otherTax = getOtherRegionTax(country);
    if (otherTax && otherTax.rate > 0) {
      const amount = Math.round(subtotal * otherTax.rate * 100) / 100;
      taxAmount += amount;
      breakdown.push({
        name: otherTax.name,
        rate: otherTax.rate,
        amount,
        type: otherTax.type,
      });
    }
  }

  return {
    subtotal,
    taxAmount: Math.round(taxAmount * 100) / 100,
    total: Math.round((subtotal + taxAmount) * 100) / 100,
    breakdown,
    currency,
    region: `${country}${state ? `-${state}` : ""}`,
  };
}

// ==================== TAX EXEMPTION MANAGEMENT ====================

export function addTaxExemption(exemption: Omit<TaxExemption, "id">): TaxExemption {
  const id = `exemption_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  const newExemption: TaxExemption = { ...exemption, id };
  
  const userExemptions = exemptions.get(exemption.userId) || [];
  userExemptions.push(newExemption);
  exemptions.set(exemption.userId, userExemptions);
  
  return newExemption;
}

export function removeTaxExemption(userId: number, exemptionId: string): boolean {
  const userExemptions = exemptions.get(userId);
  if (!userExemptions) return false;
  
  const index = userExemptions.findIndex((e) => e.id === exemptionId);
  if (index === -1) return false;
  
  userExemptions.splice(index, 1);
  exemptions.set(userId, userExemptions);
  return true;
}

export function getUserExemptions(userId: number): TaxExemption[] {
  return exemptions.get(userId) || [];
}

export function validateTaxExemption(exemptionNumber: string, region: string): {
  valid: boolean;
  message: string;
} {
  // Basic validation - in production, integrate with tax authority APIs
  if (!exemptionNumber || exemptionNumber.length < 5) {
    return { valid: false, message: "Invalid exemption number format" };
  }
  
  // EU VAT number validation (basic format check)
  if (region.startsWith("EU-")) {
    const vatPattern = /^[A-Z]{2}[0-9A-Z]{2,12}$/;
    if (!vatPattern.test(exemptionNumber.toUpperCase())) {
      return { valid: false, message: "Invalid EU VAT number format" };
    }
  }
  
  return { valid: true, message: "Exemption number format is valid" };
}

// ==================== UTILITY FUNCTIONS ====================

export function getAllUSStates(): Array<{ code: string; name: string; rate: number }> {
  return Object.entries(US_STATE_TAX_RATES).map(([code, tax]) => ({
    code,
    name: tax.name.replace(" Sales Tax", "").replace(" (No State Tax)", "").replace(" (No Sales Tax)", "").replace(" General Excise Tax", "").replace(" Gross Receipts Tax", ""),
    rate: tax.rate,
  }));
}

export function getAllEUCountries(): Array<{ code: string; name: string; rate: number }> {
  return Object.entries(EU_VAT_RATES).map(([code, tax]) => ({
    code,
    name: tax.name.replace(" VAT", ""),
    rate: tax.rate,
  }));
}

export function getAllCanadianProvinces(): Array<{ code: string; name: string; totalRate: number }> {
  return Object.entries(CANADIAN_TAX_RATES).map(([code, tax]) => ({
    code,
    name: tax.province,
    totalRate: tax.hst || ((tax.gst || 0) + (tax.pst || 0) + (tax.qst || 0)),
  }));
}

export function formatTaxAmount(amount: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(amount);
}

export function formatTaxRate(rate: number): string {
  return `${(rate * 100).toFixed(2)}%`;
}

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface StatsRow {
  zoneId: string;
  impressions: number;
  clicks: number;
  cost: number;
}

export interface WebsiteClicksRow {
  tagLink: string;
  parsedZoneId: string;
  clickCount: number;
}

export interface PublisherConversionRow {
  publisherSubId1: string; // Used as Zone ID
  estimatedEarningsUsd: number;
}

export interface AffiliateCommissionRow {
  tagLink1: string; // Used as Zone ID
  totalKomisiRp: number;
}

export interface ConsolidatedRow {
  zoneId: string;
  clicks: number;
  impressions: number;
  ctr: number;
  costUsd: number;
  konversiCostRp: number;
  komisiRp: number;
  orderCount: number; // For order/impression ratio calculations
  platform: string;
  market: string;
}

export interface Shortlink {
  id: string;
  originalUrl: string;
  zoneId: string;
  platform: string;
  market: string;
  shortlink: string;
  createdAt: string;
}

export interface GlobalConfig {
  usdToIdrRate: number;
}

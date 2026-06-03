/**
 * Static fixtures + field-set constants for the Contract tab.
 *
 * `TEST_DATA` populates the "Test data" button so admins can
 * smoke-test layout / PDF output without typing a full client.
 * `DEFAULT_NEW_FIELDS` seeds a fresh contract with the bank slot the
 * business uses by default (overridable per-contract).
 * `AUTO_FIELDS` is the allow-list of fields the form derives from
 * other inputs — write-locking these prevents the user from typing
 * over computed values.
 */

import { getTodayISO } from '@/utils/cgapAutoFill';

export const TEST_DATA: Record<string, string> = {
  companyAbv: 'WMA',
  clientCompanyName: 'Acme Corporation Pvt. Ltd.',
  clientLocation: 'Putalisadak, Kathmandu',
  clientCoordinator: 'Ram Sharma',
  contractPeriodNum: '12',
  numUsers: '25',
  paymentAmount: '150000',
  advancePercent: '100',
  signatoryName: 'Shyam Prasad',
  signatoryTitle: 'Managing Director',
  witnessName: 'Hari Bahadur',
  witnessDesignation: 'Operations Manager',
  spSignatoryName: 'Aryan Shrestha',
  spSignatoryTitle: 'Director',
  spWitnessName: 'Suman KC',
  spWitnessDesignation: 'Technical Lead',
  effectiveDate: getTodayISO(),
  bankName: 'Laxmi Sunrise Bank',
  payeeName: 'Nest Nepal Business Solution Pvt. Ltd.',
  bankAccount: '03211002193',
};

export const DEFAULT_NEW_FIELDS: Partial<Record<string, string>> = {
  effectiveDate: getTodayISO(),
  bankName: 'Laxmi Sunrise Bank',
  payeeName: 'Nest Nepal Business Solution Pvt. Ltd.',
  bankAccount: '03211002193',
};

export const AUTO_FIELDS = new Set(['paymentWords', 'contractPeriod', 'companyAbv']);

import type { ProcessStatus } from './common';

/** An APL benefit application (« demande »). */
export interface AplApplication {
  id: string;
  /** Human-readable reference, e.g. « 2024-APL-8821 ». */
  reference: string;
  status: ProcessStatus;
  /** 1-based current step in the processing pipeline. */
  currentStep: number;
  totalSteps: number;
  submittedAt: string;
  expectedCompletionAt: string | null;
  estimatedMonthlyAmount: number | null;
  completionRate: number;
}

export interface AplTimelineEntry {
  id: string;
  label: string;
  description: string;
  date: string | null;
  status: 'done' | 'current' | 'upcoming';
  attachments?: { id: string; name: string }[];
}

/** Input collected by the eligibility simulator. */
export interface AplSimulationInput {
  maritalStatus: 'single' | 'couple';
  dependents: number;
  monthlyRent: number;
  housingType: 'unfurnished' | 'furnished' | 'shared';
  postalCode: string;
  annualIncome: number;
}

export interface AplSimulationResult {
  monthlyAmount: number;
  referenceRent: number;
  shares: number;
  geographicZone: string;
  explanation: string;
}

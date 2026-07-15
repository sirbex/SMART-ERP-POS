/**
 * Reporting module barrel — Phase 5A foundation (ADR-007).
 */

export {
  REPORTING_TOUCHPOINT_REGISTRY,
  REPORTING_WRITE_GATEWAY,
  countReportingTouchpointsByStatus,
  countReportingTouchpointsByClass,
} from './reportingTouchpointRegistry.js';
export type {
  ReportingTouchpoint,
  ReportingTouchpointStatus,
  ReportingSurfaceClass,
} from './reportingTouchpointRegistry.js';

/**
 * HR & Payroll Routes
 * API endpoints for departments, positions, employees, payroll workflow
 */

import { Router } from 'express';
import { hrController } from './hr.controller.js';
import { authenticate } from '../../middleware/auth.js';
import { requirePermission } from '../../rbac/middleware.js';
import { pool as globalPool } from '../../db/pool.js';

const router = Router();

// Attach pool (multi-tenant aware)
router.use((req, _res, next) => {
    req.pool = req.tenantPool || globalPool;
    next();
});

// ============================================================================
// DEPARTMENTS
// ============================================================================

router.get('/departments', authenticate, requirePermission('hr.read'), hrController.listDepartments);
router.post('/departments', authenticate, requirePermission('hr.create'), hrController.createDepartment);
router.get('/departments/:id', authenticate, requirePermission('hr.read'), hrController.getDepartment);
router.put('/departments/:id', authenticate, requirePermission('hr.update'), hrController.updateDepartment);
router.delete('/departments/:id', authenticate, requirePermission('hr.delete'), hrController.deleteDepartment);

// ============================================================================
// POSITIONS
// ============================================================================

router.get('/positions', authenticate, requirePermission('hr.read'), hrController.listPositions);
router.post('/positions', authenticate, requirePermission('hr.create'), hrController.createPosition);
router.get('/positions/:id', authenticate, requirePermission('hr.read'), hrController.getPosition);
router.put('/positions/:id', authenticate, requirePermission('hr.update'), hrController.updatePosition);
router.delete('/positions/:id', authenticate, requirePermission('hr.delete'), hrController.deletePosition);

// ============================================================================
// EMPLOYEES
// ============================================================================

router.get('/employees', authenticate, requirePermission('hr.read'), hrController.listEmployees);
router.get('/linkable-users', authenticate, requirePermission('hr.read'), hrController.listLinkableUsers);
router.post('/employees', authenticate, requirePermission('hr.create'), hrController.createEmployee);
router.get('/employees/:id', authenticate, requirePermission('hr.read'), hrController.getEmployee);
router.put('/employees/:id', authenticate, requirePermission('hr.update'), hrController.updateEmployee);
router.post('/employees/:id/related-user', authenticate, requirePermission('hr.update'), hrController.createRelatedUser);
router.post('/employees/:id/end-employment', authenticate, requirePermission('hr.update'), hrController.endEmployment);
router.get('/employees/:id/contracts', authenticate, requirePermission('hr.read'), hrController.listEmployeeContracts);
router.post('/employees/:id/contracts', authenticate, requirePermission('hr.create'), hrController.createEmployeeContract);
router.post('/employees/:id/contracts/:contractId/sign', authenticate, requirePermission('hr.update'), hrController.signEmployeeContract);
router.post('/employees/:id/contracts/:contractId/renew', authenticate, requirePermission('hr.update'), hrController.renewEmployeeContract);
router.post('/employees/:id/contracts/:contractId/convert', authenticate, requirePermission('hr.update'), hrController.convertEmployeeEngagement);
router.post('/employees/:id/contracts/:contractId/expire', authenticate, requirePermission('hr.update'), hrController.expireEmployeeContract);
router.get('/contracts/expiring', authenticate, requirePermission('hr.read'), hrController.listExpiringContracts);
router.delete('/employees/:id', authenticate, requirePermission('hr.delete'), hrController.deleteEmployee);

// ============================================================================
// PAYROLL PERIODS
// ============================================================================

router.get('/payroll-periods', authenticate, requirePermission('hr.read'), hrController.listPayrollPeriods);
router.post('/payroll-periods', authenticate, requirePermission('hr.create'), hrController.createPayrollPeriod);
router.get('/payroll-periods/:id', authenticate, requirePermission('hr.read'), hrController.getPayrollPeriod);
router.delete('/payroll-periods/:id', authenticate, requirePermission('hr.delete'), hrController.deletePayrollPeriod);

// ============================================================================
// PAYROLL ENTRIES & WORKFLOW
// ============================================================================

router.get('/payroll-periods/:id/export', authenticate, requirePermission('hr.read'), hrController.exportPayrollPeriod);
router.get('/payroll-periods/:id/entries', authenticate, requirePermission('hr.read'), hrController.getPayrollEntries);
router.post('/payroll-periods/:id/process', authenticate, requirePermission('hr.payroll_process'), hrController.processPayroll);
router.post('/payroll-periods/:id/post', authenticate, requirePermission('hr.payroll_post'), hrController.postPayroll);
router.post('/payroll-periods/:id/pay', authenticate, requirePermission('hr.payroll_pay'), hrController.payPayroll);

router.get('/payment-accounts', authenticate, requirePermission('hr.read'), hrController.listPaymentAccounts);
router.get('/employee-balances/export', authenticate, requirePermission('hr.read'), hrController.exportBalances);
router.get('/employee-balances', authenticate, requirePermission('hr.read'), hrController.listEmployeeBalances);

router.get('/advances/export', authenticate, requirePermission('hr.read'), hrController.exportAdvances);
router.get('/advances', authenticate, requirePermission('hr.read'), hrController.listAdvances);
router.post('/advances', authenticate, requirePermission('hr.advance'), hrController.createAdvance);

router.get('/employees/:id/salary-history', authenticate, requirePermission('hr.read'), hrController.listSalaryHistory);
router.post('/employees/:id/salary-change', authenticate, requirePermission('hr.update'), hrController.promoteEmployee);

router.get('/leave-types', authenticate, requirePermission('hr.read'), hrController.listLeaveTypes);
router.post('/leave-types', authenticate, requirePermission('hr.create'), hrController.createLeaveType);
router.get('/leave-requests', authenticate, requirePermission('hr.read'), hrController.listLeaveRequests);
router.post('/leave-requests', authenticate, requirePermission('hr.create'), hrController.createLeaveRequest);
router.post('/leave-requests/:id/status', authenticate, requirePermission('hr.update'), hrController.setLeaveRequestStatus);

router.get('/statutory-settings', authenticate, requirePermission('hr.read'), hrController.getStatutorySettings);
router.put('/statutory-settings', authenticate, requirePermission('hr.update'), hrController.updateStatutorySettings);

router.get('/payroll-periods/:id/adjustments', authenticate, requirePermission('hr.read'), hrController.listPeriodAdjustments);
router.put('/payroll-periods/:id/adjustments', authenticate, requirePermission('hr.payroll_process'), hrController.upsertPeriodAdjustment);

export const hrRoutes = router;
export default router;

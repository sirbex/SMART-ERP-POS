// Phase 7: Session Management Service
// File: SamplePOS.Server/src/services/sessionService.ts

import { pool } from '../db/pool.js';
import crypto from 'crypto';
import { User } from '../../../shared/types/user.js';

export interface UserSession {
  id: string;
  userId: string;
  sessionToken: string;
  ipAddress?: string;
  userAgent?: string;
  expiresAt: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SessionData {
  user: User;
  permissions: string[];
  preferences?: Record<string, any>;
  lastActivity: string;
}

export class SessionService {
  private readonly SESSION_DURATION = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
  private readonly CLEANUP_INTERVAL = 60 * 60 * 1000; // 1 hour in milliseconds

  constructor() {
    // Start periodic cleanup
    this.startCleanupTimer();
  }

  /**
   * Create a new session for a user
   */
  async createSession(
    userId: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<UserSession> {
    // Generate secure session token
    const sessionToken = this.generateSessionToken();
    const expiresAt = new Date(Date.now() + this.SESSION_DURATION);

    const result = await pool.query(
      `INSERT INTO user_sessions (id, user_id, session_token, ip_address, user_agent, expires_at, is_active, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, true, NOW(), NOW())
       RETURNING id, user_id, session_token, ip_address, user_agent, expires_at, is_active, created_at, updated_at`,
      [userId, sessionToken, ipAddress, userAgent, expiresAt]
    );

    const session = result.rows[0];
    return {
      id: session.id,
      userId: session.user_id,
      sessionToken: session.session_token,
      ipAddress: session.ip_address,
      userAgent: session.user_agent,
      expiresAt: session.expires_at,
      isActive: session.is_active,
      createdAt: session.created_at,
      updatedAt: session.updated_at
    };
  }

  /**
   * Get session by token
   */
  async getSession(sessionToken: string): Promise<UserSession | null> {
    const result = await pool.query(
      `SELECT id, user_id, session_token, ip_address, user_agent, expires_at, is_active, created_at, updated_at
       FROM user_sessions 
       WHERE session_token = $1 AND is_active = true AND expires_at > NOW()`,
      [sessionToken]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const session = result.rows[0];
    return {
      id: session.id,
      userId: session.user_id,
      sessionToken: session.session_token,
      ipAddress: session.ip_address,
      userAgent: session.user_agent,
      expiresAt: session.expires_at,
      isActive: session.is_active,
      createdAt: session.created_at,
      updatedAt: session.updated_at
    };
  }

  /**
   * Get session with user data
   */
  async getSessionWithUser(sessionToken: string): Promise<SessionData | null> {
    const result = await pool.query(
      `SELECT 
         us.id as session_id,
         us.user_id,
         us.expires_at,
         us.updated_at as last_activity,
         u.id, u.username, u.email, u.first_name, u.last_name, u.role, u.is_active, u.created_at, u.updated_at, u.last_login_at
       FROM user_sessions us
       JOIN users u ON us.user_id = u.id
       WHERE us.session_token = $1 AND us.is_active = true AND us.expires_at > NOW() AND u.is_active = true`,
      [sessionToken]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    const user: User = {
      id: row.id,
      username: row.username,
      email: row.email,
      firstName: row.first_name,
      lastName: row.last_name,
      role: row.role,
      isActive: row.is_active,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      lastLoginAt: row.last_login_at
    };

    // Get user permissions based on role
    const permissions = this.getUserPermissions(user.role);

    return {
      user,
      permissions,
      lastActivity: row.last_activity
    };
  }

  /**
   * Update session activity
   */
  async updateSessionActivity(sessionToken: string): Promise<void> {
    await pool.query(
      'UPDATE user_sessions SET updated_at = NOW() WHERE session_token = $1 AND is_active = true',
      [sessionToken]
    );
  }

  /**
   * Extend session expiration
   */
  async extendSession(sessionToken: string): Promise<void> {
    const newExpiresAt = new Date(Date.now() + this.SESSION_DURATION);

    await pool.query(
      'UPDATE user_sessions SET expires_at = $1, updated_at = NOW() WHERE session_token = $2 AND is_active = true',
      [newExpiresAt, sessionToken]
    );
  }

  /**
   * Invalidate a specific session
   */
  async invalidateSession(sessionToken: string): Promise<void> {
    await pool.query(
      'UPDATE user_sessions SET is_active = false, updated_at = NOW() WHERE session_token = $1',
      [sessionToken]
    );
  }

  /**
   * Invalidate all sessions for a user
   */
  async invalidateAllUserSessions(userId: string): Promise<number> {
    const result = await pool.query(
      'UPDATE user_sessions SET is_active = false, updated_at = NOW() WHERE user_id = $1 AND is_active = true',
      [userId]
    );

    return result.rowCount || 0;
  }

  /**
   * Get all active sessions for a user
   */
  async getUserSessions(userId: string): Promise<UserSession[]> {
    const result = await pool.query(
      `SELECT id, user_id, session_token, ip_address, user_agent, expires_at, is_active, created_at, updated_at
       FROM user_sessions 
       WHERE user_id = $1 AND is_active = true AND expires_at > NOW()
       ORDER BY updated_at DESC`,
      [userId]
    );

    return result.rows.map(row => ({
      id: row.id,
      userId: row.user_id,
      sessionToken: row.session_token,
      ipAddress: row.ip_address,
      userAgent: row.user_agent,
      expiresAt: row.expires_at,
      isActive: row.is_active,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));
  }

  /**
   * Get session statistics
   */
  async getSessionStats(): Promise<{
    totalActiveSessions: number;
    totalUniqueUsers: number;
    averageSessionDuration: number;
    topUserAgents: { userAgent: string; count: number; }[];
  }> {
    // Total active sessions
    const totalResult = await pool.query(
      'SELECT COUNT(*) as total FROM user_sessions WHERE is_active = true AND expires_at > NOW()'
    );

    // Unique users with active sessions
    const uniqueUsersResult = await pool.query(
      'SELECT COUNT(DISTINCT user_id) as total FROM user_sessions WHERE is_active = true AND expires_at > NOW()'
    );

    // Average session duration (in minutes)
    const avgDurationResult = await pool.query(
      `SELECT AVG(EXTRACT(EPOCH FROM (updated_at - created_at))/60) as avg_duration 
       FROM user_sessions 
       WHERE is_active = false AND updated_at > created_at`
    );

    // Top user agents
    const userAgentsResult = await pool.query(
      `SELECT user_agent, COUNT(*) as count
       FROM user_sessions 
       WHERE is_active = true AND expires_at > NOW() AND user_agent IS NOT NULL
       GROUP BY user_agent
       ORDER BY count DESC
       LIMIT 10`
    );

    return {
      totalActiveSessions: parseInt(totalResult.rows[0].total),
      totalUniqueUsers: parseInt(uniqueUsersResult.rows[0].total),
      averageSessionDuration: parseFloat(avgDurationResult.rows[0].avg_duration || '0'),
      topUserAgents: userAgentsResult.rows.map(row => ({
        userAgent: row.user_agent,
        count: parseInt(row.count)
      }))
    };
  }

  /**
   * Cleanup expired sessions
   */
  async cleanupExpiredSessions(): Promise<number> {
    const result = await pool.query(
      'DELETE FROM user_sessions WHERE expires_at < NOW() OR (is_active = false AND updated_at < NOW() - INTERVAL \'7 days\')'
    );

    return result.rowCount || 0;
  }

  /**
   * Generate secure session token
   */
  private generateSessionToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Get user permissions based on role
   */
  private getUserPermissions(role: string): string[] {
    // Define actions for each module to avoid repetition
    const fullAccess = (module: string) => [`${module}:read`, `${module}:write`, `${module}:delete`];
    const writeAccess = (module: string) => [`${module}:read`, `${module}:write`];
    const readAccess = (module: string) => `${module}:read`;

    const rolePermissions: Record<string, string[]> = {
      ADMIN: [
        ...fullAccess('users'),
        ...fullAccess('products'),
        ...fullAccess('sales'),
        ...writeAccess('inventory'),
        ...fullAccess('purchase_orders'),
        ...fullAccess('customers'),
        ...writeAccess('reports'),
        readAccess('audit'),
        ...writeAccess('settings')
      ],
      MANAGER: [
        ...writeAccess('products'),
        ...writeAccess('sales'),
        ...writeAccess('inventory'),
        ...writeAccess('purchase_orders'),
        ...writeAccess('customers'),
        readAccess('reports'),
        readAccess('audit')
      ],
      CASHIER: [
        readAccess('products'),
        ...writeAccess('sales'),
        readAccess('inventory'),
        readAccess('customers')
      ],
      STAFF: [
        readAccess('products'),
        readAccess('inventory')
      ]
    };

    return rolePermissions[role] || [];
  }

  /**
   * Start periodic cleanup timer
   */
  private startCleanupTimer(): void {
    setInterval(async () => {
      try {
        const cleaned = await this.cleanupExpiredSessions();
        if (cleaned > 0) {
          console.log(`Cleaned up ${cleaned} expired sessions`);
        }
      } catch (error) {
        console.error('Session cleanup error:', error);
      }
    }, this.CLEANUP_INTERVAL);
  }
}

// Export singleton instance
export const sessionService = new SessionService();
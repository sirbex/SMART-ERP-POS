/**
 * Centralized Database Query Helper
 * Common database operations to avoid code duplication
 */

const { pool } = require('../db/pool');

/**
 * Execute a query with error handling
 * @param {string} query - SQL query
 * @param {Array} params - Query parameters
 * @returns {Promise<Object>} - Query result
 */
const executeQuery = async (query, params = []) => {
  try {
    const result = await pool.query(query, params);
    return result;
  } catch (error) {
    console.error('Database query error:', error);
    throw error;
  }
};

/**
 * Get single record by ID
 * @param {string} table - Table name
 * @param {string|number} id - Record ID
 * @param {string} idColumn - ID column name (default: 'id')
 * @returns {Promise<Object|null>} - Record or null if not found
 */
const getById = async (table, id, idColumn = 'id') => {
  const query = `SELECT * FROM ${table} WHERE ${idColumn} = $1`;
  const result = await executeQuery(query, [id]);
  return result.rows.length > 0 ? result.rows[0] : null;
};

/**
 * Get all records with pagination
 * @param {string} table - Table name
 * @param {Object} options - Query options
 * @returns {Promise<Array>} - Array of records
 */
const getAll = async (table, options = {}) => {
  const {
    limit = 50,
    offset = 0,
    orderBy = 'created_at',
    orderDirection = 'DESC',
    where = null,
    whereParams = []
  } = options;

  let query = `SELECT * FROM ${table}`;
  
  if (where) {
    query += ` WHERE ${where}`;
  }
  
  query += ` ORDER BY ${orderBy} ${orderDirection}`;
  query += ` LIMIT $${whereParams.length + 1} OFFSET $${whereParams.length + 2}`;

  const params = [...whereParams, limit, offset];
  const result = await executeQuery(query, params);
  return result.rows;
};

/**
 * Create a new record
 * @param {string} table - Table name
 * @param {Object} data - Data to insert
 * @returns {Promise<Object>} - Created record
 */
const create = async (table, data) => {
  const columns = Object.keys(data);
  const values = Object.values(data);
  const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
  
  const query = `
    INSERT INTO ${table} (${columns.join(', ')})
    VALUES (${placeholders})
    RETURNING *
  `;
  
  const result = await executeQuery(query, values);
  return result.rows[0];
};

/**
 * Update a record by ID
 * @param {string} table - Table name
 * @param {string|number} id - Record ID
 * @param {Object} data - Data to update
 * @param {string} idColumn - ID column name (default: 'id')
 * @returns {Promise<Object>} - Updated record
 */
const updateById = async (table, id, data, idColumn = 'id') => {
  const columns = Object.keys(data);
  const values = Object.values(data);
  
  const setClause = columns.map((col, i) => `${col} = $${i + 1}`).join(', ');
  const query = `
    UPDATE ${table}
    SET ${setClause}, updated_at = NOW()
    WHERE ${idColumn} = $${values.length + 1}
    RETURNING *
  `;
  
  const result = await executeQuery(query, [...values, id]);
  return result.rows.length > 0 ? result.rows[0] : null;
};

/**
 * Delete a record by ID
 * @param {string} table - Table name
 * @param {string|number} id - Record ID
 * @param {string} idColumn - ID column name (default: 'id')
 * @returns {Promise<boolean>} - True if deleted, false if not found
 */
const deleteById = async (table, id, idColumn = 'id') => {
  const query = `DELETE FROM ${table} WHERE ${idColumn} = $1 RETURNING ${idColumn}`;
  const result = await executeQuery(query, [id]);
  return result.rows.length > 0;
};

/**
 * Soft delete (mark as inactive)
 * @param {string} table - Table name
 * @param {string|number} id - Record ID
 * @param {string} idColumn - ID column name (default: 'id')
 * @returns {Promise<Object>} - Updated record
 */
const softDelete = async (table, id, idColumn = 'id') => {
  return updateById(table, id, { is_active: false }, idColumn);
};

/**
 * Count records in table
 * @param {string} table - Table name
 * @param {string} where - Optional WHERE clause
 * @param {Array} whereParams - Parameters for WHERE clause
 * @returns {Promise<number>} - Count of records
 */
const count = async (table, where = null, whereParams = []) => {
  let query = `SELECT COUNT(*) as count FROM ${table}`;
  
  if (where) {
    query += ` WHERE ${where}`;
  }
  
  const result = await executeQuery(query, whereParams);
  return parseInt(result.rows[0].count);
};

/**
 * Check if record exists
 * @param {string} table - Table name
 * @param {string} column - Column name
 * @param {*} value - Value to check
 * @returns {Promise<boolean>} - True if exists
 */
const exists = async (table, column, value) => {
  const query = `SELECT EXISTS(SELECT 1 FROM ${table} WHERE ${column} = $1) as exists`;
  const result = await executeQuery(query, [value]);
  return result.rows[0].exists;
};

/**
 * Execute a transaction
 * @param {Function} callback - Async callback function that receives the client
 * @returns {Promise<*>} - Result of the transaction
 */
const transaction = async (callback) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Search records (case-insensitive LIKE)
 * @param {string} table - Table name
 * @param {Array<string>} columns - Columns to search in
 * @param {string} searchTerm - Search term
 * @param {number} limit - Max results
 * @returns {Promise<Array>} - Matching records
 */
const search = async (table, columns, searchTerm, limit = 50) => {
  const searchPattern = `%${searchTerm}%`;
  const conditions = columns.map((col, i) => `${col} ILIKE $1`).join(' OR ');
  
  const query = `
    SELECT * FROM ${table}
    WHERE ${conditions}
    LIMIT $2
  `;
  
  const result = await executeQuery(query, [searchPattern, limit]);
  return result.rows;
};

/**
 * Bulk insert records
 * @param {string} table - Table name
 * @param {Array<Object>} records - Array of records to insert
 * @returns {Promise<Array>} - Inserted records
 */
const bulkInsert = async (table, records) => {
  if (!records || records.length === 0) {
    return [];
  }

  const columns = Object.keys(records[0]);
  const values = [];
  const placeholders = [];

  records.forEach((record, recordIndex) => {
    const recordPlaceholders = columns.map((_, colIndex) => {
      values.push(record[columns[colIndex]]);
      return `$${recordIndex * columns.length + colIndex + 1}`;
    });
    placeholders.push(`(${recordPlaceholders.join(', ')})`);
  });

  const query = `
    INSERT INTO ${table} (${columns.join(', ')})
    VALUES ${placeholders.join(', ')}
    RETURNING *
  `;

  const result = await executeQuery(query, values);
  return result.rows;
};

module.exports = {
  executeQuery,
  getById,
  getAll,
  create,
  updateById,
  deleteById,
  softDelete,
  count,
  exists,
  transaction,
  search,
  bulkInsert
};

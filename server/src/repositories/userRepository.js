/**
 * StockWise / MFEF - User Repository (PostgreSQL)
 */

const { query } = require('./db');

const formatUser = (row) => {
  if (!row) return null;
  return {
    id: row.id,
    _id: row.id,
    mongoId: row.mongo_id,
    name: row.name,
    email: row.email,
    password: row.password_hash,
    passwordHash: row.password_hash,
    role: row.role,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
};

const findByEmail = async (email) => {
  const res = await query(
    `SELECT * FROM public.users WHERE LOWER(TRIM(email)) = LOWER(TRIM($1)) LIMIT 1;`,
    [email]
  );
  return formatUser(res.rows[0]);
};

const findById = async (idOrMongoId) => {
  // Support both PostgreSQL UUID and legacy MongoDB ObjectId string
  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrMongoId);
  const sql = isUUID
    ? `SELECT * FROM public.users WHERE id = $1 LIMIT 1;`
    : `SELECT * FROM public.users WHERE mongo_id = $1 OR id::text = $1 LIMIT 1;`;
  const res = await query(sql, [idOrMongoId]);
  return formatUser(res.rows[0]);
};

const createUser = async ({ name, email, passwordHash, role = 'staff', isActive = true }) => {
  const res = await query(
    `INSERT INTO public.users (name, email, password_hash, role, is_active)
     VALUES ($1, LOWER(TRIM($2)), $3, $4, $5)
     RETURNING *;`,
    [name.trim(), email, passwordHash, role, isActive]
  );
  return formatUser(res.rows[0]);
};

const getAllUsers = async () => {
  const res = await query(
    `SELECT id, mongo_id, name, email, role, is_active, created_at, updated_at
     FROM public.users
     ORDER BY name ASC;`
  );
  return res.rows.map(formatUser);
};

const updateUser = async (idOrMongoId, { name, role, isActive, passwordHash }) => {
  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrMongoId);
  const whereClause = isUUID ? `id = $1` : `mongo_id = $1 OR id::text = $1`;

  const fields = [];
  const params = [idOrMongoId];

  if (name !== undefined) {
    params.push(name.trim());
    fields.push(`name = $${params.length}`);
  }
  if (role !== undefined) {
    params.push(role);
    fields.push(`role = $${params.length}`);
  }
  if (isActive !== undefined) {
    params.push(isActive);
    fields.push(`is_active = $${params.length}`);
  }
  if (passwordHash !== undefined) {
    params.push(passwordHash);
    fields.push(`password_hash = $${params.length}`);
  }

  if (fields.length === 0) {
    return findById(idOrMongoId);
  }

  const sql = `UPDATE public.users SET ${fields.join(', ')}, updated_at = NOW() WHERE ${whereClause} RETURNING *;`;
  const res = await query(sql, params);
  return formatUser(res.rows[0]);
};

module.exports = {
  findByEmail,
  findById,
  createUser,
  getAllUsers,
  updateUser,
  formatUser
};

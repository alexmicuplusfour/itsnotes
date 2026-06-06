const { pool } = require('../db');
const bcrypt = require('bcrypt');

class User {
  static async create(username, password) {
    const saltRounds = 12;
    const passwordHash = await bcrypt.hash(password, saltRounds);
    
    const query = `
      INSERT INTO users (username, password_hash)
      VALUES ($1, $2)
      RETURNING id, username, created_at
    `;
    
    const result = await pool.query(query, [username, passwordHash]);
    return result.rows[0];
  }
  
  static async findByUsername(username) {
    const query = 'SELECT * FROM users WHERE username = $1';
    const result = await pool.query(query, [username]);
    return result.rows[0] || null;
  }
  
  static async validatePassword(username, password) {
    const user = await User.findByUsername(username);
    if (!user) {
      return null;
    }
    
    const isValid = await bcrypt.compare(password, user.password_hash);
    if (isValid) {
      // Return user without password hash
      const { password_hash, ...userWithoutPassword } = user;
      return userWithoutPassword;
    }
    
    return null;
  }
  
  static async updatePassword(username, newPassword) {
    const saltRounds = 12;
    const passwordHash = await bcrypt.hash(newPassword, saltRounds);
    
    const query = `
      UPDATE users 
      SET password_hash = $1, updated_at = CURRENT_TIMESTAMP
      WHERE username = $2
      RETURNING id, username, updated_at
    `;
    
    const result = await pool.query(query, [passwordHash, username]);
    return result.rows[0];
  }
  
  static async exists() {
    const query = 'SELECT COUNT(*) as count FROM users';
    const result = await pool.query(query);
    return parseInt(result.rows[0].count) > 0;
  }
}

module.exports = User;

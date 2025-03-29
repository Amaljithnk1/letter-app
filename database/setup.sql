-- Create database and connect
CREATE DATABASE letter_editor;
\c letter_editor;

-- Users table (stores Firebase-authenticated users)
CREATE TABLE users (
  uid VARCHAR(255) PRIMARY KEY,
  email VARCHAR(255) NOT NULL,
  name VARCHAR(255),
  drive_access_token TEXT,
  drive_refresh_token TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Letters table
CREATE TABLE letters (
  id SERIAL PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  content TEXT NOT NULL,
  user_id VARCHAR(255) REFERENCES users(uid) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Index for faster user-based queries
CREATE INDEX idx_letters_user_id ON letters(user_id);
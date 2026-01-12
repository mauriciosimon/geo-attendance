-- Attendance tracking table for geo-fencing app
-- Run this SQL in your Supabase SQL Editor

CREATE TABLE IF NOT EXISTS attendance (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status TEXT NOT NULL CHECK (status IN ('check_in', 'check_out')),
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for faster queries by user and timestamp
CREATE INDEX IF NOT EXISTS idx_attendance_user_timestamp
ON attendance(user_id, timestamp DESC);

-- Index for date-based queries
CREATE INDEX IF NOT EXISTS idx_attendance_timestamp
ON attendance(timestamp);

-- Enable Row Level Security (RLS)
ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see their own attendance records
CREATE POLICY "Users can view own attendance"
ON attendance FOR SELECT
USING (auth.uid()::text = user_id);

-- Policy: Users can insert their own attendance records
CREATE POLICY "Users can insert own attendance"
ON attendance FOR INSERT
WITH CHECK (auth.uid()::text = user_id);

-- For development/testing without auth, you can use these permissive policies instead:
-- DROP POLICY IF EXISTS "Users can view own attendance" ON attendance;
-- DROP POLICY IF EXISTS "Users can insert own attendance" ON attendance;
-- CREATE POLICY "Allow all reads" ON attendance FOR SELECT USING (true);
-- CREATE POLICY "Allow all inserts" ON attendance FOR INSERT WITH CHECK (true);

-- ============================================
-- Saved Locations table (for location history)
-- ============================================

CREATE TABLE IF NOT EXISTS saved_locations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  label TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for faster queries
CREATE INDEX IF NOT EXISTS idx_saved_locations_user
ON saved_locations(user_id, created_at DESC);

-- Enable RLS
ALTER TABLE saved_locations ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view own locations"
ON saved_locations FOR SELECT
USING (auth.uid()::text = user_id);

CREATE POLICY "Users can insert own locations"
ON saved_locations FOR INSERT
WITH CHECK (auth.uid()::text = user_id);

CREATE POLICY "Users can delete own locations"
ON saved_locations FOR DELETE
USING (auth.uid()::text = user_id);

-- For development/testing without auth:
-- CREATE POLICY "Allow all" ON saved_locations FOR ALL USING (true) WITH CHECK (true);

-- ============================================
-- Locations table (geofence locations)
-- ============================================

CREATE TABLE IF NOT EXISTS locations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  radius_meters INTEGER NOT NULL DEFAULT 100,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for faster queries
CREATE INDEX IF NOT EXISTS idx_locations_created_by
ON locations(created_by, created_at DESC);

-- Enable RLS
ALTER TABLE locations ENABLE ROW LEVEL SECURITY;

-- Policies (allow all users to view locations, only creator can modify)
CREATE POLICY "Anyone can view locations"
ON locations FOR SELECT
USING (true);

CREATE POLICY "Users can insert locations"
ON locations FOR INSERT
WITH CHECK (true);

CREATE POLICY "Users can update own locations"
ON locations FOR UPDATE
USING (created_by = auth.uid()::text);

CREATE POLICY "Users can delete own locations"
ON locations FOR DELETE
USING (created_by = auth.uid()::text);

-- For development/testing without auth:
-- CREATE POLICY "Allow all locations" ON locations FOR ALL USING (true) WITH CHECK (true);

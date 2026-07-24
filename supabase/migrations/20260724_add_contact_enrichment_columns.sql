-- Migration: Add contact enrichment and source tracking columns to Supabase `clients` table
-- Run this in the Supabase SQL Editor for your project.

ALTER TABLE clients 
ADD COLUMN IF NOT EXISTS linkedin_company TEXT,
ADD COLUMN IF NOT EXISTS phones TEXT,
ADD COLUMN IF NOT EXISTS contact_source_url TEXT,
ADD COLUMN IF NOT EXISTS contact_source_page TEXT,
ADD COLUMN IF NOT EXISTS contact_source_label TEXT,
ADD COLUMN IF NOT EXISTS contact_source_context TEXT;

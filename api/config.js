// api/config.js
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error("CRITICAL ERROR: SUPABASE_URL and SUPABASE_KEY must be defined in env variables.");
}

const supabase = createClient(supabaseUrl, supabaseKey);

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'logistica123';
const JWT_SECRET = process.env.JWT_SECRET || 'rcr_secreto_super_seguro_2026';
const JWT_EXPIRATION = '24h';

module.exports = {
    supabase,
    ADMIN_PASSWORD,
    JWT_SECRET,
    JWT_EXPIRATION
};

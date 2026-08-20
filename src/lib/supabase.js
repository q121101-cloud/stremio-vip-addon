'use strict';

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

let supabase = null;
if (supabaseUrl && supabaseKey) {
  try {
    supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false },
    });
    console.log('[Supabase] Client initialized successfully');
  } catch (err) {
    console.warn('[Supabase] Init warning:', err.message);
  }
} else {
  console.log('[Supabase] Running in local/in-memory mode (credentials not found)');
}

module.exports = {
  supabase,
};

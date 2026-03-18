import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabaseKey = process.env.REACT_APP_SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    'Supabase credentials are missing. Set REACT_APP_SUPABASE_URL and REACT_APP_SUPABASE_SERVICE_KEY in your environment.'
  );
}

export const supabase = createClient(supabaseUrl, supabaseKey);

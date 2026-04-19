import { createClient } from '@supabase/supabase-js';

const url = process.env.REACT_APP_SUPABASE_URL;
const key = process.env.REACT_APP_SUPABASE_ANON_KEY;

if (!url || !key) {
  console.error(
    '[supabase] REACT_APP_SUPABASE_URL or REACT_APP_SUPABASE_ANON_KEY is not set. ' +
    'Auth and direct DB calls will not work.'
  );
}

export default createClient(
  url || 'https://placeholder.supabase.co',
  key || 'placeholder-anon-key'
);
